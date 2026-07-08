import type { GameView, TicketView } from "./abi";

export interface PrizeBps { lineBps: number; fullhouseBps: number; hostBps: number }

export interface LinePrize { line: number; winner: `0x${string}`; payout: bigint }
export interface FullhousePrize { winner: `0x${string}`; payout: bigint; host: `0x${string}`; hostFee: bigint }

export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

export function lineWinnersFromGame(g: GameView, bps: PrizeBps): LinePrize[] {
  const payout = (g.pot * BigInt(bps.lineBps)) / 10_000n;
  return [g.topLineWinner, g.middleLineWinner, g.bottomLineWinner].flatMap((winner, line) =>
    winner === ZERO_ADDRESS ? [] : [{ line, winner, payout }],
  );
}

// The stored line winners are exactly the lines paid before the game ended, so
// the full-house share (fullhouseBps + lineBps per unclaimed line) is
// reconstructable from GameView without scanning historical events.
export function fullhousePrizeFromGame(g: GameView, bps: PrizeBps): FullhousePrize | undefined {
  if (g.fullhouseWinner === ZERO_ADDRESS) return undefined;
  const unclaimedLines = 3 - lineWinnersFromGame(g, bps).length;
  return {
    winner: g.fullhouseWinner,
    payout: (g.pot * BigInt(bps.fullhouseBps + bps.lineBps * unclaimedLines)) / 10_000n,
    host: g.host,
    hostFee: (g.pot * BigInt(bps.hostBps)) / 10_000n,
  };
}

export interface WinningTickets {
  lineTickets: (`0x${string}` | undefined)[]; // ticket hash per line 0/1/2
  fullhouseTicket?: `0x${string}`;
}

/** Attribute each won prize to the exact ticket the contract paid it for.
 *
 * The contract only stores the winning *owner*, but `_checkWinners` awards a
 * prize to the first ticket (in draw order, then array order) whose mask
 * completes — which is fully reconstructable from `drawnOrder`. Without this,
 * every completed row on every ticket of a winning owner would look like the
 * winning line. */
export function winningTickets(g: GameView, tickets: TicketView[], drawnOrder: number[]): WinningTickets {
  const drawIndex = new Map<number, number>();
  drawnOrder.forEach((n, i) => drawIndex.set(n, i));

  const completedAt = (mask: bigint): number => {
    if (mask === 0n) return Infinity;
    let last = -1;
    for (let n = 1; n <= 90; n++) {
      if (mask & (1n << BigInt(n - 1))) {
        const i = drawIndex.get(n);
        if (i === undefined) return Infinity;
        if (i > last) last = i;
      }
    }
    return last;
  };

  const pick = (winner: `0x${string}`, maskOf: (t: TicketView) => bigint): `0x${string}` | undefined => {
    if (winner === ZERO_ADDRESS) return undefined;
    let bestHash: `0x${string}` | undefined;
    let bestAt = Infinity;
    for (const t of tickets) {
      if (t.owner.toLowerCase() !== winner.toLowerCase()) continue;
      const at = completedAt(maskOf(t));
      if (at < bestAt) { bestAt = at; bestHash = t.hash; }
    }
    return bestHash;
  };

  return {
    lineTickets: [
      pick(g.topLineWinner,    (t) => t.topRowMask),
      pick(g.middleLineWinner, (t) => t.middleRowMask),
      pick(g.bottomLineWinner, (t) => t.bottomRowMask),
    ],
    fullhouseTicket: pick(g.fullhouseWinner, (t) => t.fullhouseMask),
  };
}
