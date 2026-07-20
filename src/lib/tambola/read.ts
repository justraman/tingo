/**
 * Read-only contract calls — `ReviveApi.call` dry-runs through the use-truapi
 * contract handle (host-safe in both host and standalone modes).
 */

import { toH160 } from "@use-truapi/core";
import { NATIVE_TO_ETH_RATIO, READ_ONLY_ORIGIN } from "@/lib/chain/constants";
import { getTambolaContract, type TambolaContract } from "./contract";
import type { GameView, TicketView } from "./abi";
import type { PrizeBps } from "./prize";

export type { PrizeBps } from "./prize";

const weiToPlanck = (wei: bigint) => wei / NATIVE_TO_ETH_RATIO;

type QueryHandle = { query: (...args: unknown[]) => Promise<{ success: boolean; value: unknown }> };

/**
 * Dry-run a read on an already-resolved handle (from `useContract` or
 * `getTambolaContract`). The connected account may not be revive-mapped yet,
 * and this runtime rejects dry-runs from unmapped origins — always read as
 * the known-mapped read-only origin instead of the signer.
 */
export async function queryTambola<T = unknown>(
  contract: TambolaContract,
  functionName: string,
  args: readonly unknown[] = [],
): Promise<T> {
  const handle = (contract as unknown as Record<string, QueryHandle>)[functionName];
  if (!handle) throw new Error(`unknown contract method ${functionName}`);
  const result = await handle.query(...args, { origin: READ_ONLY_ORIGIN });
  if (!result.success) throw new Error(`dry-run failed for ${functionName}`);
  return result.value as T;
}

async function readContract<T = unknown>(functionName: string, args: readonly unknown[] = []): Promise<T> {
  return queryTambola<T>(await getTambolaContract(), functionName, args);
}

/** Contract-side amounts arrive in 18-dec wei; the app works in planck. */
export const gameFromChain = (g: GameView): GameView => ({
  ...g,
  ticketPrice: weiToPlanck(g.ticketPrice),
  pot:         weiToPlanck(g.pot),
});

// -- typed wrappers -------------------------------------------------------

export const readNextGameId = () => readContract<bigint>("nextGameId");

export const readGame = (gameId: bigint) =>
  readContract<GameView>("getGame", [gameId]).then(gameFromChain);

export const readDrawnNumbers = (gameId: bigint) =>
  readContract<readonly number[]>("getDrawnNumbers", [gameId]).then((arr) => Array.from(arr));

export const readTickets = (gameId: bigint) =>
  readContract<readonly TicketView[]>("getTickets", [gameId]).then((arr) => Array.from(arr));

// Player params take SS58 or H160 — the contract only knows H160.
// Multi-output functions decode to an object keyed by output names.
export const readTicketsByOwner = (gameId: bigint, player: string) =>
  readContract<{ ticketIds: readonly bigint[]; tickets: readonly TicketView[] }>(
    "getTicketsByOwner", [gameId, toH160(player)],
  ).then(({ ticketIds, tickets }) => ({ ids: Array.from(ticketIds), tickets: Array.from(tickets) }));

export const readIsTicketHashUsed = (gameId: bigint, hash: `0x${string}`) =>
  readContract<boolean>("isTicketHashUsed", [gameId, hash]);

export const readIsRefundClaimed = (gameId: bigint, player: string) =>
  readContract<boolean>("isRefundClaimed", [gameId, toH160(player)]);

export const readWithdrawable = (account: string) =>
  readContract<bigint>("withdrawable", [toH160(account)]).then(weiToPlanck);

// Contract constants — cache the successful read for the session.
let prizeBpsCache: Promise<PrizeBps> | null = null;
export function readPrizeBps(): Promise<PrizeBps> {
  if (!prizeBpsCache) {
    prizeBpsCache = Promise.all([
      readContract<number>("LINE_BPS"),
      readContract<number>("FULLHOUSE_BPS"),
      readContract<number>("HOST_BPS"),
    ]).then(([lineBps, fullhouseBps, hostBps]) => ({ lineBps, fullhouseBps, hostBps }));
    prizeBpsCache.catch(() => { prizeBpsCache = null; });
  }
  return prizeBpsCache;
}
