import type { GameView, TicketView } from "./abi";

export interface PrizeBps { lineBps: number; fullhouseBps: number; hostBps: number }

export interface LinePrize { line: number; winner: `0x${string}`; payout: bigint }
export interface FullhousePrize { winner: `0x${string}`; payout: bigint; host: `0x${string}`; hostFee: bigint }

export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

// Mirrors the contract's split: equal shares, first winner absorbs the
// division remainder.
function splitShares(amount: bigint, count: number): bigint[] {
  const share = amount / BigInt(count);
  return Array.from({ length: count }, (_, i) =>
    i === 0 ? amount - share * BigInt(count - 1) : share,
  );
}

export function lineWinnersFromGame(g: GameView, bps: PrizeBps): LinePrize[] {
  const amount = (g.pot * BigInt(bps.lineBps)) / 10_000n;
  return [g.topLineWinners, g.middleLineWinners, g.bottomLineWinners].flatMap((winners, line) => {
    if (winners.length === 0) return [];
    const shares = splitShares(amount, winners.length);
    return winners.map((winner, i) => ({ line, winner, payout: shares[i] }));
  });
}

// The stored line winners are exactly the lines paid before the game ended, so
// the full-house pool (fullhouseBps + lineBps per unclaimed line) is
// reconstructable from GameView without scanning historical events.
export function fullhousePrizesFromGame(g: GameView, bps: PrizeBps): FullhousePrize[] {
  if (g.fullhouseWinners.length === 0) return [];
  const unclaimedLines = [g.topLineWinners, g.middleLineWinners, g.bottomLineWinners]
    .filter((w) => w.length === 0).length;
  const amount = (g.pot * BigInt(bps.fullhouseBps + bps.lineBps * unclaimedLines)) / 10_000n;
  const hostFee = (g.pot * BigInt(bps.hostBps)) / 10_000n;
  const shares = splitShares(amount, g.fullhouseWinners.length);
  return g.fullhouseWinners.map((winner, i) => ({ winner, payout: shares[i], host: g.host, hostFee }));
}

export interface WinningTickets {
  lineTickets: `0x${string}`[][]; // winning ticket hashes per line 0/1/2
  fullhouseTickets: `0x${string}`[];
}

/** Attribute each won prize to the exact tickets the contract paid it for.
 *
 * The contract only stores the winning *owners*, but a prize goes to every
 * ticket that completes on the claiming draw — i.e. every ticket whose mask
 * completes at the earliest completion index in `drawnOrder`. Without this,
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

  const pick = (won: boolean, maskOf: (t: TicketView) => bigint): `0x${string}`[] => {
    if (!won) return [];
    const at = tickets.map((t) => completedAt(maskOf(t)));
    const first = Math.min(...at);
    if (!Number.isFinite(first)) return [];
    return tickets.filter((_, i) => at[i] === first).map((t) => t.hash);
  };

  return {
    lineTickets: [
      pick(g.topLineWinners.length > 0,    (t) => t.topRowMask),
      pick(g.middleLineWinners.length > 0, (t) => t.middleRowMask),
      pick(g.bottomLineWinners.length > 0, (t) => t.bottomRowMask),
    ],
    fullhouseTickets: pick(g.fullhouseWinners.length > 0, (t) => t.fullhouseMask),
  };
}
