/**
 * Read-only contract calls via PAPI's `ReviveApi.call` dry-run.
 *
 * Pattern is the host-safe path documented in the polkadot-triangle skill —
 * encode calldata with viem, run a dry-run over the WebSocket-bound PAPI
 * client, then decode the returned bytes with viem. Works in both host and
 * standalone modes (host mode forbids direct HTTP, which is why we don't use
 * a viem PublicClient).
 */

import { encodeFunctionData, decodeFunctionResult, bytesToHex, type Abi } from "viem";
import { Binary } from "polkadot-api";
import { toH160 } from "@parity/product-sdk-address";
import { getClient } from "@/lib/chain/client";
import { NATIVE_TO_ETH_RATIO, READ_ONLY_ORIGIN, TAMBOLA_ADDRESS } from "@/lib/chain/constants";
import { TAMBOLA_ABI, type GameView, type TicketView } from "./abi";
import type { PrizeBps } from "./prize";

export type { PrizeBps } from "./prize";

const weiToPlanck = (wei: bigint) => wei / NATIVE_TO_ETH_RATIO;

type Args = readonly unknown[];

async function readContract<T = unknown>(functionName: string, args: Args = []): Promise<T> {
  const client = await getClient();
  // Cast: the unsafe API surface is the only one exposing ReviveApi.call today.
  const unsafe = (client as unknown as { getUnsafeApi: () => any }).getUnsafeApi();

  const calldata = encodeFunctionData({ abi: TAMBOLA_ABI as Abi, functionName, args });

  // PAPI v2 + metadata v16: H160 params are hex strings, Bytes results are Uint8Array.
  // `at: "best"` — reads reflect just-included transactions instead of lagging
  // behind by the finalization delay.
  const dryRun = await unsafe.apis.ReviveApi.call(
    READ_ONLY_ORIGIN,
    TAMBOLA_ADDRESS.toLowerCase(),
    0n,
    undefined,
    undefined,
    Binary.fromHex(calldata),
    { at: "best" },
  );

  if (!dryRun.result.success) throw new Error(`dry-run failed for ${functionName}`);
  if (dryRun.result.value.flags & 1) throw new Error(`contract reverted in ${functionName}`);

  const raw = dryRun.result.value.data;
  const data = (typeof raw === "string" ? raw : bytesToHex(raw.asBytes?.() ?? raw)) as `0x${string}`;
  return decodeFunctionResult({ abi: TAMBOLA_ABI as Abi, functionName, data }) as T;
}

// -- typed wrappers -------------------------------------------------------

export const readNextGameId = () => readContract<bigint>("nextGameId");

export const readGame = (gameId: bigint) =>
  readContract<GameView>("getGame", [gameId]).then((g) => ({
    ...g,
    ticketPrice: weiToPlanck(g.ticketPrice),
    pot:         weiToPlanck(g.pot),
  }));

export const readDrawnNumbers = (gameId: bigint) =>
  readContract<readonly number[]>("getDrawnNumbers", [gameId]).then((arr) => Array.from(arr));

export const readTickets = (gameId: bigint) =>
  readContract<readonly TicketView[]>("getTickets", [gameId]).then((arr) => Array.from(arr));

// Player params take SS58 or H160 — the contract only knows H160.
export const readTicketsByOwner = (gameId: bigint, player: string) =>
  readContract<readonly [readonly bigint[], readonly TicketView[]]>(
    "getTicketsByOwner", [gameId, toH160(player)],
  ).then(([ids, tickets]) => ({ ids: Array.from(ids), tickets: Array.from(tickets) }));

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
