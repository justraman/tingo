/**
 * Mutating contract calls. Builds a `Revive.call` extrinsic, wraps with
 * `Utility.batch_all(Revive.map_account, …)` if the account isn't mapped yet,
 * and exposes a Promise-shaped `watchTransaction` helper around the PAPI
 * observable.
 */

import { encodeFunctionData, type Abi } from "viem";
import { Binary, type PolkadotSigner } from "polkadot-api";
import { getClient } from "@/lib/chain/client";
import { TAMBOLA_ADDRESS } from "@/lib/chain/constants";
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
  const destBin  = Binary.fromHex(TAMBOLA_ADDRESS.toLowerCase());
  const dataBin  = Binary.fromHex(calldata);

  // Dry run to estimate weight + storage deposit.
  const dryRun = await unsafe.apis.ReviveApi.call(
    signerAddress,
    destBin,
    value,
    undefined,
    undefined,
    dataBin,
  );
  if (!dryRun.result.success) throw new Error(`dry-run failed for ${functionName}`);
  if (dryRun.result.value.flags & 1) throw new Error(`contract reverted (${functionName})`);

  const weightLimit = {
    ref_time:    dryRun.weight_required.ref_time   * GAS_MULTIPLIER,
    proof_size:  dryRun.weight_required.proof_size * GAS_MULTIPLIER,
  };
  const storageDepositLimit = dryRun.storage_deposit?.value;

  const reviveCall = unsafe.tx.Revive.call({
    dest: destBin,
    value,
    weight_limit: weightLimit,
    storage_deposit_limit: storageDepositLimit,
    data: dataBin,
  });

  // Map the account if it hasn't been mapped already.
  let isMapped = false;
  try {
    isMapped = await (client as unknown as { inkSdk?: { addressIsMapped: (a: string) => Promise<boolean> } })
      .inkSdk?.addressIsMapped?.(signerAddress) ?? false;
  } catch { /* fallthrough */ }

  if (!isMapped) {
    const mapCall = unsafe.tx.Revive.map_account();
    return unsafe.tx.Utility.batch_all({
      calls: [mapCall.decodedCall, reviveCall.decodedCall],
    });
  }
  return reviveCall;
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
        error: (e: any) => { sub.unsubscribe(); reject(e); },
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
