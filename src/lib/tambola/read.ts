/**
 * Read-only contract calls via PAPI's `ReviveApi.call` dry-run.
 *
 * Pattern is the host-safe path documented in the polkadot-triangle skill —
 * encode calldata with viem, run a dry-run over the WebSocket-bound PAPI
 * client, then decode the returned bytes with viem. Works in both host and
 * standalone modes (host mode forbids direct HTTP, which is why we don't use
 * a viem PublicClient).
 */

import { encodeFunctionData, decodeFunctionResult, type Abi } from "viem";
import { Binary } from "polkadot-api";
import { getClient } from "@/lib/chain/client";
import { READ_ONLY_ORIGIN, TAMBOLA_ADDRESS } from "@/lib/chain/constants";
import { TAMBOLA_ABI, type GameView, type TicketView } from "./abi";

type Args = readonly unknown[];

async function readContract<T = unknown>(functionName: string, args: Args = []): Promise<T> {
  const client = await getClient();
  // Cast: the unsafe API surface is the only one exposing ReviveApi.call today.
  const unsafe = (client as unknown as { getUnsafeApi: () => any }).getUnsafeApi();

  const calldata = encodeFunctionData({ abi: TAMBOLA_ABI as Abi, functionName, args });

  const dryRun = await unsafe.apis.ReviveApi.call(
    READ_ONLY_ORIGIN,
    Binary.fromHex(TAMBOLA_ADDRESS.toLowerCase()),
    0n,
    undefined,
    undefined,
    Binary.fromHex(calldata),
  );

  if (!dryRun.result.success) throw new Error(`dry-run failed for ${functionName}`);
  if (dryRun.result.value.flags & 1) throw new Error(`contract reverted in ${functionName}`);

  const data = dryRun.result.value.data.asHex() as `0x${string}`;
  return decodeFunctionResult({ abi: TAMBOLA_ABI as Abi, functionName, data }) as T;
}

// -- typed wrappers -------------------------------------------------------

export const readNextGameId = () => readContract<bigint>("nextGameId");

export const readGame = (gameId: bigint) =>
  readContract<GameView>("getGame", [gameId]);

export const readDrawnNumbers = (gameId: bigint) =>
  readContract<readonly number[]>("getDrawnNumbers", [gameId]).then((arr) => Array.from(arr));

export const readTickets = (gameId: bigint) =>
  readContract<readonly TicketView[]>("getTickets", [gameId]).then((arr) => Array.from(arr));

export const readTicketByOwner = (gameId: bigint, player: `0x${string}`) =>
  readContract<readonly [bigint, TicketView]>("getTicketByOwner", [gameId, player]);

export const readIsTicketHashUsed = (gameId: bigint, hash: `0x${string}`) =>
  readContract<boolean>("isTicketHashUsed", [gameId, hash]);

export const readIsRefundClaimed = (gameId: bigint, player: `0x${string}`) =>
  readContract<boolean>("isRefundClaimed", [gameId, player]);

export const readWithdrawable = (account: `0x${string}`) =>
  readContract<bigint>("withdrawable", [account]);
