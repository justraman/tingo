/**
 * Mutating contract calls. Builds a `Revive.call` extrinsic, wraps with
 * `Utility.batch_all(Revive.map_account, …)` if the account isn't mapped yet,
 * and exposes a Promise-shaped `watchTransaction` helper around the PAPI
 * observable.
 */

import { bytesToHex, decodeErrorResult, encodeFunctionData, type Abi } from "viem";
import { Binary, type PolkadotSigner } from "polkadot-api";
import { ss58ToH160 } from "@parity/product-sdk-address";
import { getClient } from "@/lib/chain/client";
import { READ_ONLY_ORIGIN, TAMBOLA_ADDRESS } from "@/lib/chain/constants";
import { TAMBOLA_ABI } from "./abi";
import type { TicketLayout } from "./encode";

const GAS_MULTIPLIER = 4n;

export type TxStatus = "signing" | "broadcasted" | "in-block" | "finalized";

async function buildContractCall(
  signerAddress: string,
  functionName: string,
  args: readonly unknown[],
  value: bigint,
) {
  const client = await getClient();
  const unsafe = (client as unknown as { getUnsafeApi: () => any }).getUnsafeApi();

  const calldata = encodeFunctionData({ abi: TAMBOLA_ABI as Abi, functionName, args });
  // PAPI v2 + metadata v16: H160 params are hex strings, not Binary.
  const dest    = TAMBOLA_ADDRESS.toLowerCase() as `0x${string}`;
  const dataBin = Binary.fromHex(calldata);

  // Map the account if it hasn't been mapped already. map_account reverts for
  // already-mapped accounts, which would fail the whole batch_all.
  const h160 = ss58ToH160(signerAddress);
  const isMapped = (await unsafe.query.Revive.OriginalAccount.getValue(h160)) !== undefined;

  // The runtime rejects dry-runs from unmapped origins (AccountUnmapped), so
  // estimate with the known-mapped read origin until this account is mapped.
  const dryRunOrigin = isMapped ? signerAddress : READ_ONLY_ORIGIN;
  const dryRun = await unsafe.apis.ReviveApi.call(
    dryRunOrigin,
    dest,
    value,
    undefined,
    undefined,
    dataBin,
  );
  if (!dryRun.result.success) {
    throw new Error(`dry-run failed for ${functionName}: ${describeDispatchError(dryRun.result.value)}`);
  }
  if (dryRun.result.value.flags & 1) {
    throw new Error(`contract reverted (${functionName}): ${decodeRevertReason(dryRun.result.value.data)}`);
  }

  const weightLimit = {
    ref_time:    dryRun.weight_required.ref_time   * GAS_MULTIPLIER,
    proof_size:  dryRun.weight_required.proof_size * GAS_MULTIPLIER,
  };
  const storageDepositLimit = dryRun.storage_deposit?.value;

  const reviveCall = unsafe.tx.Revive.call({
    dest,
    value,
    weight_limit: weightLimit,
    storage_deposit_limit: storageDepositLimit,
    data: dataBin,
  });

  if (!isMapped) {
    const mapCall = unsafe.tx.Revive.map_account();
    return unsafe.tx.Utility.batch_all({
      calls: [mapCall.decodedCall, reviveCall.decodedCall],
    });
  }
  return reviveCall;
}

// Revert data is ABI-encoded — Error(string) for require messages, Panic(uint)
// for asserts. viem decodes both without needing error entries in our ABI.
function decodeRevertReason(raw: any): string {
  try {
    const data = (typeof raw === "string" ? raw : bytesToHex(raw.asBytes?.() ?? raw)) as `0x${string}`;
    const decoded = decodeErrorResult({ abi: TAMBOLA_ABI as Abi, data });
    return `${decoded.errorName}(${(decoded.args ?? []).map(String).join(", ")})`;
  } catch {
    return "unknown reason";
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
    return /"Invalid"[\s\S]*"Payment"/.test(e.message);
  }
  return false;
}

function normalizeTxError(e: unknown): Error {
  if (isInsufficientFundsError(e)) {
    return new Error(
      "Your account can't pay the transaction fee — top it up at faucet.polkadot.io (Asset Hub) and retry.",
    );
  }
  return e instanceof Error ? e : new Error(String(e));
}

export async function watchTransaction(
  tx: { signSubmitAndWatch: (signer: PolkadotSigner, opts?: any) => any },
  signer: PolkadotSigner,
  onStatus?: (s: TxStatus) => void,
): Promise<`0x${string}`> {
  return new Promise((resolve, reject) => {
    let resolved = false;
    const sub = tx
      .signSubmitAndWatch(signer, { mortality: { mortal: true, period: 256 } })
      .subscribe({
        next: (event: any) => {
          if (event.type === "broadcasted")              onStatus?.("broadcasted");
          if (event.type === "txBestBlocksState" && event.found && !resolved) {
            if (!event.ok) { sub.unsubscribe(); reject(new Error("dispatch error")); return; }
            resolved = true; onStatus?.("in-block"); resolve(event.txHash);
          }
          if (event.type === "finalized") {
            if (!resolved) {
              if (!event.ok) { sub.unsubscribe(); reject(new Error("dispatch error")); return; }
              resolve(event.txHash);
            }
            onStatus?.("finalized");
            sub.unsubscribe();
          }
        },
        error: (e: any) => { sub.unsubscribe(); reject(normalizeTxError(e)); },
      });
  });
}

// ---- typed entry points -----------------------------------------------

export async function callCreateGame(opts: {
  signerAddress: string;
  signer: PolkadotSigner;
  startTimestampSec: bigint;
  ticketPrice: bigint;
  onStatus?: (s: TxStatus) => void;
}) {
  const tx = await buildContractCall(opts.signerAddress, "createGame",
    [opts.startTimestampSec, opts.ticketPrice], 0n);
  return watchTransaction(tx, opts.signer, opts.onStatus);
}

export async function callBuyTicket(opts: {
  signerAddress: string;
  signer: PolkadotSigner;
  gameId: bigint;
  layout: TicketLayout;
  ticketPrice: bigint;
  onStatus?: (s: TxStatus) => void;
}) {
  const tx = await buildContractCall(opts.signerAddress, "buyTicket",
    [opts.gameId, opts.layout], opts.ticketPrice);
  return watchTransaction(tx, opts.signer, opts.onStatus);
}

export async function callDrawNumber(opts: {
  signerAddress: string;
  signer: PolkadotSigner;
  gameId: bigint;
  onStatus?: (s: TxStatus) => void;
}) {
  const tx = await buildContractCall(opts.signerAddress, "drawNumber",
    [opts.gameId], 0n);
  return watchTransaction(tx, opts.signer, opts.onStatus);
}

export async function callClaimRefund(opts: {
  signerAddress: string;
  signer: PolkadotSigner;
  gameId: bigint;
  onStatus?: (s: TxStatus) => void;
}) {
  const tx = await buildContractCall(opts.signerAddress, "claimRefund",
    [opts.gameId], 0n);
  return watchTransaction(tx, opts.signer, opts.onStatus);
}

export async function callWithdraw(opts: {
  signerAddress: string;
  signer: PolkadotSigner;
  onStatus?: (s: TxStatus) => void;
}) {
  const tx = await buildContractCall(opts.signerAddress, "withdraw", [], 0n);
  return watchTransaction(tx, opts.signer, opts.onStatus);
}
