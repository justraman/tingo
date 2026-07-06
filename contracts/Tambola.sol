// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ITambola} from "./ITambola.sol";

/// @title Tambola — on-chain Indian Bingo
/// @notice One contract holds many concurrent games. Each game has up to 100 players,
///         a host-defined ticket price, a host-defined start block, and pays 15/15/15/50/5
///         to top-line / middle-line / bottom-line / full-house / host.
/// @dev    Public types, events, and external function signatures live in ITambola.sol —
///         keep them in sync if you change either side.
/// @custom:cdm @tambola/tambola
contract Tambola is ITambola {
    struct Game {
        address host;
        uint256 ticketPrice;     // wei (PAS has 10 decimals; pallet-revive treats it as 18 internally)
        uint64  startTime;       // unix seconds; game opens for draws once block.timestamp reaches it
        uint64  lastDrawBlock;
        uint8   maxPlayers;
        uint8   playerCount;
        uint128 polledMask;      // 90-bit bitmap of drawn numbers
        uint256 pot;             // total contributions (constant after the last buyTicket)
        GameState state;
        address topLineWinner;
        address middleLineWinner;
        address bottomLineWinner;
        address fullhouseWinner;
        uint8[]   drawnOrder;    // ordered draw history, length ≤ 90
        Ticket[]  tickets;       // ticketId is `index + 1`
    }

    mapping(uint256 => Game)                              internal _games;
    mapping(uint256 => mapping(bytes32 => bool))          internal _ticketHashSeen;
    mapping(uint256 => mapping(address => uint256))       internal _playerTicketId;
    mapping(uint256 => mapping(address => bool))          internal _refundClaimed;

    /// Pull-payment ledger. All payouts (line wins, full house, host fee,
    /// refunds) credit here; recipients withdraw via `withdraw()`. This makes
    /// the game robust against malicious recipients whose `receive` reverts —
    /// a push-based payout would freeze the game permanently.
    mapping(address => uint256) public override withdrawable;

    uint256 public override nextGameId;

    bool private _entered;

    uint8  public constant override BLOCKS_BETWEEN_DRAWS = 5;     // ~10 s on a 2 s chain
    uint8  public constant override MAX_PLAYERS          = 100;
    uint16 public constant override FULLHOUSE_BPS        = 5000;  // 50 %
    uint16 public constant override LINE_BPS             = 1500;  // 15 % each
    uint16 public constant override HOST_BPS             = 500;   //  5 %
    uint8  public constant override MAX_NUMBER           = 90;

    modifier nonReentrant() {
        require(!_entered, "reentrant");
        _entered = true;
        _;
        _entered = false;
    }

    // ---------------------------------------------------------------------
    //  Host: schedule a game
    // ---------------------------------------------------------------------

    /// @param startTimestamp unix seconds the host wants the game to start; stored as-is and gated on block.timestamp.
    /// @param ticketPrice    price per ticket in the chain's native token (wei units).
    function createGame(uint256 startTimestamp, uint256 ticketPrice) external override returns (uint256 gameId) {
        require(startTimestamp > block.timestamp, "start in past");
        require(ticketPrice > 0, "zero price");

        gameId = ++nextGameId;
        Game storage g = _games[gameId];
        g.host        = msg.sender;
        g.ticketPrice = ticketPrice;
        g.maxPlayers  = MAX_PLAYERS;
        g.state       = GameState.Pending;
        g.startTime   = uint64(startTimestamp);

        emit GameCreated(gameId, msg.sender, g.startTime, ticketPrice);
    }

    // ---------------------------------------------------------------------
    //  Player: buy a ticket
    // ---------------------------------------------------------------------

    /// @param layout row-major 3x9 grid. layout[row*9 + col] = number (or 0 for empty cell).
    function buyTicket(uint256 gameId, uint8[27] calldata layout) external payable override {
        Game storage g = _games[gameId];
        require(g.host != address(0),              "no game");
        require(g.state == GameState.Pending,      "not pending");
        require(block.timestamp < g.startTime,     "already started");
        require(msg.value == g.ticketPrice,        "wrong price");
        require(g.playerCount < g.maxPlayers,      "full");
        require(_playerTicketId[gameId][msg.sender] == 0, "already bought");

        (uint128 fullMask, uint128 topMask, uint128 midMask, uint128 botMask) = _validateAndMask(layout);

        bytes32 layoutHash = keccak256(abi.encodePacked(layout));
        require(!_ticketHashSeen[gameId][layoutHash], "duplicate ticket");
        _ticketHashSeen[gameId][layoutHash] = true;

        g.tickets.push(Ticket({
            owner:          msg.sender,
            fullhouseMask:  fullMask,
            topRowMask:     topMask,
            middleRowMask:  midMask,
            bottomRowMask:  botMask,
            hash:           layoutHash
        }));
        uint256 ticketId = g.tickets.length;
        _playerTicketId[gameId][msg.sender] = ticketId;
        g.playerCount++;
        g.pot += msg.value;

        emit TicketBought(gameId, msg.sender, ticketId, layoutHash);
    }

    // ---------------------------------------------------------------------
    //  Anyone: draw the next number (permissionless poker)
    // ---------------------------------------------------------------------

    function drawNumber(uint256 gameId) external override {
        Game storage g = _games[gameId];
        require(g.host != address(0),                                  "no game");
        require(g.state == GameState.Pending || g.state == GameState.Live, "ended");
        require(g.playerCount > 0,                                      "no players");
        require(block.timestamp >= g.startTime,                         "not started");
        require(block.number >= g.lastDrawBlock + BLOCKS_BETWEEN_DRAWS, "too soon");
        require(g.drawnOrder.length < MAX_NUMBER,                       "all drawn");

        if (g.state == GameState.Pending) g.state = GameState.Live;

        uint8 n = _nextNumber(g);
        g.polledMask |= uint128(1) << (n - 1);
        g.drawnOrder.push(n);
        g.lastDrawBlock = uint64(block.number);
        emit NumberDrawn(gameId, n, uint64(block.number));

        bool ended = _checkWinners(gameId, g);
        if (!ended && g.drawnOrder.length == MAX_NUMBER) {
            g.state = GameState.NoWinner;
            emit GameEndedNoWinner(gameId);
        }
    }

    // ---------------------------------------------------------------------
    //  Player: claim refund when a game ends without a full-house winner
    // ---------------------------------------------------------------------

    function claimRefund(uint256 gameId) external override {
        Game storage g = _games[gameId];
        require(g.state == GameState.NoWinner,             "not refundable");
        require(_playerTicketId[gameId][msg.sender] != 0,  "no ticket");
        require(!_refundClaimed[gameId][msg.sender],       "already claimed");

        uint16 linesPaid =
            (g.topLineWinner    != address(0) ? 1 : 0) +
            (g.middleLineWinner != address(0) ? 1 : 0) +
            (g.bottomLineWinner != address(0) ? 1 : 0);
        uint256 potRemaining = g.pot * (10000 - LINE_BPS * linesPaid) / 10000;
        uint256 amount       = potRemaining / g.playerCount;

        _refundClaimed[gameId][msg.sender] = true;
        _pay(msg.sender, amount);
        emit RefundClaimed(gameId, msg.sender, amount);
    }

    // ---------------------------------------------------------------------
    //  Internals
    // ---------------------------------------------------------------------

    /// Enforce Tambola structural rules and produce the four bitmaps in one pass.
    /// Reverts on any rule violation.
    function _validateAndMask(uint8[27] calldata layout)
        internal
        pure
        returns (uint128 fullMask, uint128 topMask, uint128 midMask, uint128 botMask)
    {
        uint8 rowCount0;
        uint8 rowCount1;
        uint8 rowCount2;
        uint8 nonzero;

        for (uint256 col = 0; col < 9; col++) {
            uint16 minVal = col == 0 ? 1 : uint16(col) * 10;
            uint16 maxVal = col == 8 ? 90 : uint16(col) * 10 + 9;
            uint8  colCount;
            uint16 prevInCol;                              // 0 = none yet

            for (uint256 row = 0; row < 3; row++) {
                uint8 v = layout[row * 9 + col];
                if (v == 0) continue;
                require(v >= minVal && v <= maxVal, "bad col range");
                require(v > prevInCol,              "col not increasing");
                prevInCol = v;
                colCount++;
                nonzero++;

                uint128 bit = uint128(1) << (v - 1);
                require(fullMask & bit == 0, "duplicate number");
                fullMask |= bit;

                if (row == 0)      { topMask |= bit; rowCount0++; }
                else if (row == 1) { midMask |= bit; rowCount1++; }
                else               { botMask |= bit; rowCount2++; }
            }
            require(colCount >= 1 && colCount <= 3, "bad col count");
        }
        require(nonzero  == 15,                              "not 15 cells");
        require(rowCount0 == 5 && rowCount1 == 5 && rowCount2 == 5, "row != 5");
    }

    /// Pick the next un-drawn number using consensus randomness mixed with game state.
    function _nextNumber(Game storage g) internal view returns (uint8) {
        uint256 entropy = uint256(keccak256(abi.encodePacked(
            block.prevrandao,
            block.timestamp,
            blockhash(block.number - 1),
            msg.sender,
            g.polledMask,
            g.drawnOrder.length
        )));
        uint8 remaining = MAX_NUMBER - uint8(g.drawnOrder.length);
        uint8 pick      = uint8(entropy % remaining);
        uint8 seen;
        for (uint8 i = 1; i <= MAX_NUMBER; i++) {
            if (g.polledMask & (uint128(1) << (i - 1)) == 0) {
                if (seen == pick) return i;
                unchecked { seen++; }
            }
        }
        revert("unreachable");
    }

    /// After a draw, walk every ticket and award newly completed lines + the full house if any.
    /// Returns true iff the game ended (full house found).
    function _checkWinners(uint256 gameId, Game storage g) internal returns (bool) {
        uint256 lineAmount = g.pot * LINE_BPS / 10000;

        uint256 len = g.tickets.length;
        for (uint256 i = 0; i < len; i++) {
            Ticket storage t = g.tickets[i];

            if (g.topLineWinner == address(0) && (t.topRowMask & g.polledMask) == t.topRowMask) {
                g.topLineWinner = t.owner;
                _pay(t.owner, lineAmount);
                emit LineWon(gameId, 0, t.owner, lineAmount);
            }
            if (g.middleLineWinner == address(0) && (t.middleRowMask & g.polledMask) == t.middleRowMask) {
                g.middleLineWinner = t.owner;
                _pay(t.owner, lineAmount);
                emit LineWon(gameId, 1, t.owner, lineAmount);
            }
            if (g.bottomLineWinner == address(0) && (t.bottomRowMask & g.polledMask) == t.bottomRowMask) {
                g.bottomLineWinner = t.owner;
                _pay(t.owner, lineAmount);
                emit LineWon(gameId, 2, t.owner, lineAmount);
            }

            if ((t.fullhouseMask & g.polledMask) == t.fullhouseMask) {
                g.fullhouseWinner = t.owner;
                uint256 unclaimedLines =
                    (g.topLineWinner    == address(0) ? 1 : 0) +
                    (g.middleLineWinner == address(0) ? 1 : 0) +
                    (g.bottomLineWinner == address(0) ? 1 : 0);
                uint256 fullAmount = g.pot * (FULLHOUSE_BPS + LINE_BPS * unclaimedLines) / 10000;
                uint256 hostFee    = g.pot * HOST_BPS / 10000;
                _pay(t.owner, fullAmount);
                _pay(g.host,  hostFee);
                g.state = GameState.Won;
                emit GameWon(gameId, t.owner, fullAmount, g.host, hostFee);
                return true;
            }
        }
        return false;
    }

    /// Credit `amount` to `to`'s pull-payment balance. Never reverts (other
    /// than on overflow, which 0.8.x reverts automatically). Recipient
    /// withdraws via `withdraw()`.
    function _pay(address to, uint256 amount) internal {
        if (amount == 0) return;
        withdrawable[to] += amount;
    }

    /// Withdraw any pending balance. Checks-effects-interactions pattern: zero
    /// the balance before the external call, and a `nonReentrant` guard makes
    /// double-withdraw impossible even if the recipient re-enters.
    function withdraw() external override nonReentrant {
        uint256 amount = withdrawable[msg.sender];
        require(amount > 0, "nothing to withdraw");
        withdrawable[msg.sender] = 0;
        (bool ok, ) = payable(msg.sender).call{value: amount}("");
        require(ok, "withdraw failed");
        emit Withdrawn(msg.sender, amount);
    }

    // ---------------------------------------------------------------------
    //  Views
    // ---------------------------------------------------------------------

    function getGame(uint256 gameId) external view override returns (GameView memory) {
        Game storage g = _games[gameId];
        return GameView({
            host:             g.host,
            ticketPrice:      g.ticketPrice,
            startTime:        g.startTime,
            lastDrawBlock:    g.lastDrawBlock,
            maxPlayers:       g.maxPlayers,
            playerCount:      g.playerCount,
            polledMask:       g.polledMask,
            pot:              g.pot,
            state:            g.state,
            topLineWinner:    g.topLineWinner,
            middleLineWinner: g.middleLineWinner,
            bottomLineWinner: g.bottomLineWinner,
            fullhouseWinner:  g.fullhouseWinner,
            drawnCount:       g.drawnOrder.length
        });
    }

    function getDrawnNumbers(uint256 gameId) external view override returns (uint8[] memory) {
        return _games[gameId].drawnOrder;
    }

    function getTickets(uint256 gameId) external view override returns (Ticket[] memory) {
        return _games[gameId].tickets;
    }

    function getTicketByOwner(uint256 gameId, address player)
        external
        view
        override
        returns (uint256 ticketId, Ticket memory ticket)
    {
        ticketId = _playerTicketId[gameId][player];
        if (ticketId > 0) ticket = _games[gameId].tickets[ticketId - 1];
    }

    function isTicketHashUsed(uint256 gameId, bytes32 hashValue) external view override returns (bool) {
        return _ticketHashSeen[gameId][hashValue];
    }

    function isRefundClaimed(uint256 gameId, address player) external view override returns (bool) {
        return _refundClaimed[gameId][player];
    }
}
