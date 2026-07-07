/**
 * Tambola contract ABI, hand-written to match `contracts/Tambola.sol`.
 *
 * After running `npm run compile:contract`, the canonical artifact in
 * `artifacts/contracts/Tambola.sol/Tambola.json` should match this — if the
 * Solidity source changes, regenerate by reading `.abi` out of that JSON.
 */

export const TAMBOLA_ABI = [
  // ---- mutating ----
  {
    type: "function", name: "createGame", stateMutability: "nonpayable",
    inputs: [
      { name: "startTimestamp", type: "uint256" },
      { name: "ticketPrice",    type: "uint256" },
    ],
    outputs: [{ name: "gameId", type: "uint256" }],
  },
  {
    type: "function", name: "buyTicket", stateMutability: "payable",
    inputs: [
      { name: "gameId", type: "uint256" },
      { name: "layout", type: "uint8[27]" },
    ],
    outputs: [],
  },
  {
    type: "function", name: "drawNumber", stateMutability: "nonpayable",
    inputs: [{ name: "gameId", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function", name: "claimRefund", stateMutability: "nonpayable",
    inputs: [{ name: "gameId", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function", name: "withdraw", stateMutability: "nonpayable",
    inputs: [], outputs: [],
  },

  // ---- views ----
  {
    type: "function", name: "nextGameId", stateMutability: "view",
    inputs: [], outputs: [{ type: "uint256" }],
  },
  {
    type: "function", name: "getGame", stateMutability: "view",
    inputs: [{ name: "gameId", type: "uint256" }],
    outputs: [{
      name: "g", type: "tuple",
      components: [
        { name: "host",             type: "address" },
        { name: "ticketPrice",      type: "uint256" },
        { name: "startTime",        type: "uint64"  },
        { name: "lastDrawBlock",    type: "uint64"  },
        { name: "maxTickets",       type: "uint8"   },
        { name: "ticketCount",      type: "uint8"   },
        { name: "polledMask",       type: "uint128" },
        { name: "pot",              type: "uint256" },
        { name: "state",            type: "uint8"   },
        { name: "topLineWinner",    type: "address" },
        { name: "middleLineWinner", type: "address" },
        { name: "bottomLineWinner", type: "address" },
        { name: "fullhouseWinner",  type: "address" },
        { name: "drawnCount",       type: "uint256" },
      ],
    }],
  },
  {
    type: "function", name: "getDrawnNumbers", stateMutability: "view",
    inputs: [{ name: "gameId", type: "uint256" }],
    outputs: [{ type: "uint8[]" }],
  },
  {
    type: "function", name: "getTickets", stateMutability: "view",
    inputs: [{ name: "gameId", type: "uint256" }],
    outputs: [{
      type: "tuple[]",
      components: [
        { name: "owner",          type: "address" },
        { name: "fullhouseMask",  type: "uint128" },
        { name: "topRowMask",     type: "uint128" },
        { name: "middleRowMask",  type: "uint128" },
        { name: "bottomRowMask",  type: "uint128" },
        { name: "hash",           type: "bytes32" },
      ],
    }],
  },
  {
    type: "function", name: "getTicketsByOwner", stateMutability: "view",
    inputs: [
      { name: "gameId", type: "uint256" },
      { name: "player", type: "address" },
    ],
    outputs: [
      { name: "ticketIds", type: "uint256[]" },
      {
        name: "tickets", type: "tuple[]",
        components: [
          { name: "owner",          type: "address" },
          { name: "fullhouseMask",  type: "uint128" },
          { name: "topRowMask",     type: "uint128" },
          { name: "middleRowMask",  type: "uint128" },
          { name: "bottomRowMask",  type: "uint128" },
          { name: "hash",           type: "bytes32" },
        ],
      },
    ],
  },
  {
    type: "function", name: "isTicketHashUsed", stateMutability: "view",
    inputs: [
      { name: "gameId",    type: "uint256" },
      { name: "hashValue", type: "bytes32" },
    ],
    outputs: [{ type: "bool" }],
  },
  {
    type: "function", name: "isRefundClaimed", stateMutability: "view",
    inputs: [
      { name: "gameId", type: "uint256" },
      { name: "player", type: "address" },
    ],
    outputs: [{ type: "bool" }],
  },
  {
    type: "function", name: "withdrawable", stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "uint256" }],
  },

  // ---- events ----
  {
    type: "event", name: "GameCreated", anonymous: false,
    inputs: [
      { name: "gameId",      type: "uint256", indexed: true  },
      { name: "host",        type: "address", indexed: true  },
      { name: "startTime",   type: "uint64",  indexed: false },
      { name: "ticketPrice", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event", name: "TicketBought", anonymous: false,
    inputs: [
      { name: "gameId",   type: "uint256", indexed: true  },
      { name: "player",   type: "address", indexed: true  },
      { name: "ticketId", type: "uint256", indexed: false },
      { name: "hash",     type: "bytes32", indexed: false },
    ],
  },
  {
    type: "event", name: "NumberDrawn", anonymous: false,
    inputs: [
      { name: "gameId",      type: "uint256", indexed: true  },
      { name: "number",      type: "uint8",   indexed: false },
      { name: "blockNumber", type: "uint64",  indexed: false },
    ],
  },
  {
    type: "event", name: "LineWon", anonymous: false,
    inputs: [
      { name: "gameId", type: "uint256", indexed: true  },
      { name: "line",   type: "uint8",   indexed: false },
      { name: "winner", type: "address", indexed: true  },
      { name: "payout", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event", name: "GameWon", anonymous: false,
    inputs: [
      { name: "gameId",  type: "uint256", indexed: true  },
      { name: "winner",  type: "address", indexed: true  },
      { name: "payout",  type: "uint256", indexed: false },
      { name: "host",    type: "address", indexed: false },
      { name: "hostFee", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event", name: "GameEndedNoWinner", anonymous: false,
    inputs: [{ name: "gameId", type: "uint256", indexed: true }],
  },
  {
    type: "event", name: "RefundClaimed", anonymous: false,
    inputs: [
      { name: "gameId", type: "uint256", indexed: true  },
      { name: "player", type: "address", indexed: true  },
      { name: "amount", type: "uint256", indexed: false },
    ],
  },
] as const;

export type GameState = "Pending" | "Live" | "Won" | "NoWinner";
export const GAME_STATES: GameState[] = ["Pending", "Live", "Won", "NoWinner"];

export interface GameView {
  host: `0x${string}`;
  ticketPrice: bigint;
  startTime: bigint;
  lastDrawBlock: bigint;
  maxTickets: number;
  ticketCount: number;
  polledMask: bigint;
  pot: bigint;
  state: number;
  topLineWinner: `0x${string}`;
  middleLineWinner: `0x${string}`;
  bottomLineWinner: `0x${string}`;
  fullhouseWinner: `0x${string}`;
  drawnCount: bigint;
}

export interface TicketView {
  owner: `0x${string}`;
  fullhouseMask: bigint;
  topRowMask: bigint;
  middleRowMask: bigint;
  bottomRowMask: bigint;
  hash: `0x${string}`;
}
