// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title ITambola — interface and shared types for the on-chain Tambola game.
/// @notice External surface only — the implementation lives in `Tambola.sol`.
///         Frontend clients can derive the ABI from this file alone.
interface ITambola {
    // ---------------------------------------------------------------------
    //  Types
    // ---------------------------------------------------------------------

    enum GameState { Pending, Live, Won, NoWinner }

    /// Single ticket. Bitmaps are 90-bit (bit `i` ↔ number `i + 1`).
    struct Ticket {
        address owner;
        uint128 fullhouseMask;   // all 15 numbers
        uint128 topRowMask;      // row 0 (5 bits)
        uint128 middleRowMask;   // row 1 (5 bits)
        uint128 bottomRowMask;   // row 2 (5 bits)
        bytes32 hash;            // keccak256 of the canonical layout
    }

    /// Public view of a game's scalar fields (the full Game struct contains
    /// mappings/arrays, so we expose this flattened tuple instead).
    struct GameView {
        address host;
        uint256 ticketPrice;
        uint64  startTime;
        uint64  lastDrawTime;
        uint8   maxTickets;
        uint8   ticketCount;
        uint128 polledMask;
        uint256 pot;
        GameState state;
        address topLineWinner;
        address middleLineWinner;
        address bottomLineWinner;
        address fullhouseWinner;
        uint256 drawnCount;
    }

    // ---------------------------------------------------------------------
    //  Events
    // ---------------------------------------------------------------------

    event GameCreated(uint256 indexed gameId, address indexed host, uint64 startTime, uint256 ticketPrice);
    event TicketBought(uint256 indexed gameId, address indexed player, uint256 ticketId, bytes32 hash);
    event NumberDrawn(uint256 indexed gameId, uint8 number, uint64 drawnAt);
    /// `line` ∈ {0: top, 1: middle, 2: bottom}.
    event LineWon(uint256 indexed gameId, uint8 line, address indexed winner, uint256 payout);
    event GameWon(uint256 indexed gameId, address indexed winner, uint256 payout, address host, uint256 hostFee);
    event GameEndedNoWinner(uint256 indexed gameId);
    event RefundClaimed(uint256 indexed gameId, address indexed player, uint256 amount);
    event Withdrawn(address indexed to, uint256 amount);

    // ---------------------------------------------------------------------
    //  Mutating
    // ---------------------------------------------------------------------

    /// Schedule a game. `startTimestamp` (unix seconds) is stored as-is; the game
    /// opens for draws once `block.timestamp` reaches it.
    function createGame(uint256 startTimestamp, uint256 ticketPrice) external returns (uint256 gameId);

    /// Buy a ticket. `layout` is the row-major 3x9 grid; `layout[row*9 + col]`
    /// is the number at that cell, or 0 for an empty cell. Must send exactly
    /// `ticketPrice` as msg.value. A player may buy any number of tickets while
    /// capacity lasts; each layout must be unique within the game.
    function buyTicket(uint256 gameId, uint8[27] calldata layout) external payable;

    /// Draw the next number. Permissionless: anyone can call once
    /// `block.timestamp >= startTime` AND
    /// `block.timestamp >= lastDrawTime + DRAW_INTERVAL_SECONDS`.
    function drawNumber(uint256 gameId) external;

    /// Claim the refund share for all of `msg.sender`'s tickets once a game
    /// ends in `NoWinner`. Credits the pull-payment ledger; call `withdraw()`
    /// to receive funds.
    function claimRefund(uint256 gameId) external;

    /// Withdraw all credited balance for `msg.sender`.
    function withdraw() external;

    // ---------------------------------------------------------------------
    //  Views
    // ---------------------------------------------------------------------

    function nextGameId() external view returns (uint256);
    function withdrawable(address account) external view returns (uint256);

    function getGame(uint256 gameId) external view returns (GameView memory);
    function getDrawnNumbers(uint256 gameId) external view returns (uint8[] memory);
    function getTickets(uint256 gameId) external view returns (Ticket[] memory);
    function getTicketsByOwner(uint256 gameId, address player)
        external view returns (uint256[] memory ticketIds, Ticket[] memory tickets);

    function isTicketHashUsed(uint256 gameId, bytes32 hashValue) external view returns (bool);
    function isRefundClaimed(uint256 gameId, address player)   external view returns (bool);

    // ---------------------------------------------------------------------
    //  Constants
    // ---------------------------------------------------------------------

    function DRAW_INTERVAL_SECONDS() external view returns (uint16);
    function MAX_TICKETS()           external view returns (uint8);
    function FULLHOUSE_BPS()         external view returns (uint16);
    function LINE_BPS()              external view returns (uint16);
    function HOST_BPS()              external view returns (uint16);
    function MAX_NUMBER()            external view returns (uint8);
}
