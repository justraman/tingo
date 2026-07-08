// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ITambola} from "./ITambola.sol";

/// @title Tambola — on-chain Indian Bingo
/// @notice One contract holds many concurrent games. Each game has up to 100 tickets
///         (a player may hold several), a host-defined ticket price, a host-defined
///         start time, and pays 15/15/15/50/5 to top-line / middle-line /
///         bottom-line / full-house / host. When several tickets complete the
///         same prize on the same draw, that prize is split equally between
///         them. All timing is wall-clock (`block.timestamp`) — block numbers
///         play no role in game rules.
/// @dev    Public types, events, and external function signatures live in ITambola.sol —
///         keep them in sync if you change either side.
/// @custom:cdm @tambola/tambola
contract Tambola is ITambola {
    struct Game {
        address host;
        uint256 ticketPrice;     // wei (PAS has 10 decimals; pallet-revive treats it as 18 internally)
        uint64  startTime;       // unix seconds; game opens for draws once block.timestamp reaches it
        uint64  lastDrawTime;    // unix seconds of the latest draw; 0 until the first draw
        uint8   maxTickets;
        uint8   ticketCount;
        uint128 polledMask;      // 90-bit bitmap of drawn numbers
        uint256 pot;             // total contributions (constant after the last buyTicket)
        GameState state;
        address[] topLineWinners;     // every ticket that completed the line on its claiming draw
        address[] middleLineWinners;
        address[] bottomLineWinners;
        address[] fullhouseWinners;
        uint8[]   drawnOrder;    // ordered draw history, length ≤ 90
        Ticket[]  tickets;       // ticketId is `index + 1`
    }

    mapping(uint256 => Game)                              internal _games;
    mapping(uint256 => mapping(bytes32 => bool))          internal _ticketHashSeen;
    mapping(uint256 => mapping(address => uint256[]))     internal _playerTicketIds;
    mapping(uint256 => mapping(address => bool))          internal _refundClaimed;

    /// Pull-payment ledger. All payouts (line wins, full house, host fee,
    /// refunds) credit here; recipients withdraw via `withdraw()`. This makes
    /// the game robust against malicious recipients whose `receive` reverts —
    /// a push-based payout would freeze the game permanently.
    mapping(address => uint256) public override withdrawable;

    uint256 public override nextGameId;

    bool private _entered;

    uint16 public constant override DRAW_INTERVAL_SECONDS = 6;
    uint8  public constant override MAX_TICKETS            = 100;
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
        g.maxTickets  = MAX_TICKETS;
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
        require(g.ticketCount < g.maxTickets,      "full");

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
        _playerTicketIds[gameId][msg.sender].push(ticketId);
        g.ticketCount++;
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
        require(g.ticketCount > 0,                                      "no tickets");
        require(block.timestamp >= g.startTime,                             "not started");
        require(block.timestamp >= g.lastDrawTime + DRAW_INTERVAL_SECONDS,  "too soon");
        require(g.drawnOrder.length < MAX_NUMBER,                           "all drawn");

        if (g.state == GameState.Pending) g.state = GameState.Live;

        uint8 n = _nextNumber(g);
        g.polledMask |= uint128(1) << (n - 1);
        g.drawnOrder.push(n);
        g.lastDrawTime = uint64(block.timestamp);
        emit NumberDrawn(gameId, n, uint64(block.timestamp));

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
        require(g.state == GameState.NoWinner,                     "not refundable");
        uint256 ownedTickets = _playerTicketIds[gameId][msg.sender].length;
        require(ownedTickets != 0,                                  "no ticket");
        require(!_refundClaimed[gameId][msg.sender],                "already claimed");

        uint16 linesPaid =
            (g.topLineWinners.length    != 0 ? 1 : 0) +
            (g.middleLineWinners.length != 0 ? 1 : 0) +
            (g.bottomLineWinners.length != 0 ? 1 : 0);
        uint256 potRemaining = g.pot * (10000 - LINE_BPS * linesPaid) / 10000;
        uint256 amount       = (potRemaining / g.ticketCount) * ownedTickets;

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

    /// After a draw, award every ticket that newly completed a line, then the full
    /// house. Tickets completing the same prize on the same draw split it equally
    /// (per ticket, so an owner holding two completing tickets gets two shares).
    /// Returns true iff the game ended (full house found).
    function _checkWinners(uint256 gameId, Game storage g) internal returns (bool) {
        _awardLine(gameId, g, 0, g.topLineWinners);
        _awardLine(gameId, g, 1, g.middleLineWinners);
        _awardLine(gameId, g, 2, g.bottomLineWinners);

        uint256 len = g.tickets.length;
        for (uint256 i = 0; i < len; i++) {
            Ticket storage t = g.tickets[i];
            if ((t.fullhouseMask & g.polledMask) == t.fullhouseMask) g.fullhouseWinners.push(t.owner);
        }
        uint256 n = g.fullhouseWinners.length;
        if (n == 0) return false;

        uint256 unclaimedLines =
            (g.topLineWinners.length    == 0 ? 1 : 0) +
            (g.middleLineWinners.length == 0 ? 1 : 0) +
            (g.bottomLineWinners.length == 0 ? 1 : 0);
        uint256 fullAmount = g.pot * (FULLHOUSE_BPS + LINE_BPS * unclaimedLines) / 10000;
        uint256 hostFee    = g.pot * HOST_BPS / 10000;
        uint256 share      = fullAmount / n;
        for (uint256 i = 0; i < n; i++) {
            // The first winner absorbs the split remainder so the pot stays fully paid out.
            uint256 payout = i == 0 ? fullAmount - share * (n - 1) : share;
            _pay(g.fullhouseWinners[i], payout);
            emit GameWon(gameId, g.fullhouseWinners[i], payout, g.host, hostFee);
        }
        _pay(g.host, hostFee);
        g.state = GameState.Won;
        return true;
    }

    /// Claim `line` for every ticket whose row completed, splitting the line
    /// prize equally between them. No-op if the line was claimed on an earlier
    /// draw or no ticket completes it now.
    function _awardLine(uint256 gameId, Game storage g, uint8 line, address[] storage winners) internal {
        if (winners.length != 0) return;

        uint256 len = g.tickets.length;
        for (uint256 i = 0; i < len; i++) {
            Ticket storage t = g.tickets[i];
            uint128 mask = line == 0 ? t.topRowMask : line == 1 ? t.middleRowMask : t.bottomRowMask;
            if ((mask & g.polledMask) == mask) winners.push(t.owner);
        }
        uint256 n = winners.length;
        if (n == 0) return;

        uint256 amount = g.pot * LINE_BPS / 10000;
        uint256 share  = amount / n;
        for (uint256 i = 0; i < n; i++) {
            uint256 payout = i == 0 ? amount - share * (n - 1) : share;
            _pay(winners[i], payout);
            emit LineWon(gameId, line, winners[i], payout);
        }
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
            lastDrawTime:     g.lastDrawTime,
            maxTickets:       g.maxTickets,
            ticketCount:      g.ticketCount,
            polledMask:       g.polledMask,
            pot:              g.pot,
            state:             g.state,
            topLineWinners:    g.topLineWinners,
            middleLineWinners: g.middleLineWinners,
            bottomLineWinners: g.bottomLineWinners,
            fullhouseWinners:  g.fullhouseWinners,
            drawnCount:        g.drawnOrder.length
        });
    }

    function getDrawnNumbers(uint256 gameId) external view override returns (uint8[] memory) {
        return _games[gameId].drawnOrder;
    }

    function getTickets(uint256 gameId) external view override returns (Ticket[] memory) {
        return _games[gameId].tickets;
    }

    function getTicketsByOwner(uint256 gameId, address player)
        external
        view
        override
        returns (uint256[] memory ticketIds, Ticket[] memory tickets)
    {
        ticketIds = _playerTicketIds[gameId][player];
        tickets   = new Ticket[](ticketIds.length);
        for (uint256 i = 0; i < ticketIds.length; i++) {
            tickets[i] = _games[gameId].tickets[ticketIds[i] - 1];
        }
    }

    function isTicketHashUsed(uint256 gameId, bytes32 hashValue) external view override returns (bool) {
        return _ticketHashSeen[gameId][hashValue];
    }

    function isRefundClaimed(uint256 gameId, address player) external view override returns (bool) {
        return _refundClaimed[gameId][player];
    }
}
