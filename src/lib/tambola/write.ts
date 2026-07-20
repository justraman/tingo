/**
 * Mutating contract calls through the use-truapi contract handle: dry-run
 * pre-flight, sign with the runtime's signer manager, submit and watch.
 */

import type { TxResult, TxStatus } from "@use-truapi/react";
import { truapi } from "@/lib/truapi";
import { NATIVE_TO_ETH_RATIO } from "@/lib/chain/constants";
import { TAMBOLA_CDM, getTambolaContract } from "./contract";
import type { TicketLayout } from "./encode";

export type { TxStatus };

type TxHandle = { tx: (...args: unknown[]) => Promise<TxResult> };

interface TxOpts {
  value?: bigint;                     // native planck — the runtime scales it into msg.value
  onStatus?: (s: TxStatus) => void;
}

async function contractTx(
  functionName: string,
  args: readonly unknown[],
  { value = 0n, onStatus }: TxOpts,
): Promise<string> {
  await truapi.accounts.connect();
  // The host gates signing on ChainSubmit and hangs silently without it, and
  // the map_account below may itself need to sign — request permission first.
  await truapi.accounts.ensureChainSubmitPermission();
  // The tx dry-run runs as the signer, and this runtime rejects dry-runs from
  // unmapped origins — idempotent fast-path when already mapped.
  await truapi.contracts.ensureMapped(TAMBOLA_CDM);

  const contract = await getTambolaContract();
  const handle = (contract as unknown as Record<string, TxHandle>)[functionName];
  if (!handle) throw new Error(`unknown contract method ${functionName}`);

  try {
    const result = await handle.tx(...args, { value, onStatus });
    if (!result.ok) {
      throw new Error(`dispatch failed for ${functionName}: ${describeDispatchError(result.dispatchError)}`);
    }
    return result.txHash;
  } catch (e) {
    throw normalizeTxError(e);
  }
}

function describeDispatchError(error: unknown): string {
  try {
    return JSON.stringify(error, (_, v) => (typeof v === "bigint" ? v.toString() : v));
  } catch {
    return String(error);
  }
}

// The runtime reports "can't pay fees" as an Invalid/Payment validity error;
// depending on the papi version it lands on the error object or as JSON in
// `.message` (same heuristic as dotli-starter).
function isInsufficientFundsError(e: any): boolean {
  if (!e) return false;
  if (e.type === "Invalid" && e.value?.type === "Payment") return true;
  if (typeof e.message === "string") {
    try {
      const parsed = JSON.parse(e.message);
      if (parsed?.type === "Invalid" && parsed?.value?.type === "Payment") return true;
    } catch { /* fall through to substring check */ }
    if (/"Invalid"[\s\S]*"Payment"/.test(e.message)) return true;
  }
  return isInsufficientFundsError(e.cause);
}

function normalizeTxError(e: unknown): Error {
  if (isInsufficientFundsError(e)) {
    return new Error(
      "Your account can't pay the transaction fee — top it up at faucet.polkadot.io (Asset Hub) and retry.",
    );
  }
  return e instanceof Error ? e : new Error(String(e));
}

// ---- typed entry points -----------------------------------------------

export async function callCreateGame(opts: {
  startTimestampSec: bigint;
  ticketPrice: bigint;                    // planck
  onStatus?: (s: TxStatus) => void;
}) {
  // The contract stores ticketPrice in 18-dec wei and compares it against
  // msg.value, which the runtime derives as `Revive.call value × RATIO`.
  return contractTx("createGame",
    [opts.startTimestampSec, opts.ticketPrice * NATIVE_TO_ETH_RATIO],
    { onStatus: opts.onStatus });
}

export async function callBuyTicket(opts: {
  gameId: bigint;
  layout: TicketLayout;
  ticketPrice: bigint;                    // planck — the runtime scales it into msg.value
  onStatus?: (s: TxStatus) => void;
}) {
  return contractTx("buyTicket", [opts.gameId, opts.layout],
    { value: opts.ticketPrice, onStatus: opts.onStatus });
}

export async function callDrawNumber(opts: {
  gameId: bigint;
  onStatus?: (s: TxStatus) => void;
}) {
  return contractTx("drawNumber", [opts.gameId], { onStatus: opts.onStatus });
}

export async function callClaimRefund(opts: {
  gameId: bigint;
  onStatus?: (s: TxStatus) => void;
}) {
  return contractTx("claimRefund", [opts.gameId], { onStatus: opts.onStatus });
}

export async function callWithdraw(opts: {
  onStatus?: (s: TxStatus) => void;
}) {
  return contractTx("withdraw", [], { onStatus: opts.onStatus });
}
