/**
 * Tambola contract event subscription.
 *
 * pallet-revive emits Solidity events as raw `ContractEmitted` system events
 * with `(contract, data, topics[])` fields. We watch them via PAPI, filter by
 * our contract address, and decode each one against the ABI with viem.
 */

import { bytesToHex, decodeEventLog, type Abi } from "viem";
import { getClient } from "@/lib/chain/client";
import { NATIVE_TO_ETH_RATIO, TAMBOLA_ADDRESS } from "@/lib/chain/constants";
import { TAMBOLA_ABI } from "./abi";

/** All amounts are converted from the contract's 18-dec wei to native planck. */
export type TambolaEvent =
  | { name: "GameCreated";       args: { gameId: bigint; host: `0x${string}`; startTime: bigint; ticketPrice: bigint } }
  | { name: "TicketBought";      args: { gameId: bigint; player: `0x${string}`; ticketId: bigint; hash: `0x${string}` } }
  | { name: "NumberDrawn";       args: { gameId: bigint; number: number; blockNumber: bigint } }
  | { name: "LineWon";           args: { gameId: bigint; line: number; winner: `0x${string}`; payout: bigint } }
  | { name: "GameWon";           args: { gameId: bigint; winner: `0x${string}`; payout: bigint; host: `0x${string}`; hostFee: bigint } }
  | { name: "GameEndedNoWinner"; args: { gameId: bigint } }
  | { name: "RefundClaimed";     args: { gameId: bigint; player: `0x${string}`; amount: bigint } };

export type Unsubscribe = () => void;

const WEI_ARGS: Record<string, string[]> = {
  GameCreated:   ["ticketPrice"],
  LineWon:       ["payout"],
  GameWon:       ["payout", "hostFee"],
  RefundClaimed: ["amount"],
};

function weiArgsToPlanck(name: string, args: Record<string, unknown>) {
  const fields = WEI_ARGS[name];
  if (!fields) return args;
  const out = { ...args };
  for (const f of fields) out[f] = (out[f] as bigint) / NATIVE_TO_ETH_RATIO;
  return out;
}

/** Subscribe to all Tambola events on the contract. Returns a teardown fn. */
export async function subscribeEvents(handler: (e: TambolaEvent) => void): Promise<Unsubscribe> {
  const client = await getClient();
  const unsafe = (client as unknown as { getUnsafeApi: () => any }).getUnsafeApi();

  // PAPI v2 + metadata v16: H160/H256 fields are hex strings, Bytes are Uint8Array.
  const toHexString = (v: any): `0x${string}` =>
    typeof v === "string" ? (v as `0x${string}`) : v?.asHex?.() ?? bytesToHex(v);

  const sub = unsafe.event.Revive.ContractEmitted.watch().subscribe({
    next: (ev: any) => {
      const contract = toHexString(ev.payload?.contract ?? "0x").toLowerCase();
      if (contract !== TAMBOLA_ADDRESS.toLowerCase()) return;
      const data = toHexString(ev.payload.data);
      const topics = (ev.payload.topics ?? []).map(toHexString) as [
        signature: `0x${string}`,
        ...args: `0x${string}`[],
      ];
      try {
        const decoded = decodeEventLog({ abi: TAMBOLA_ABI as Abi, data, topics }) as unknown as {
          eventName: string;
          args: Record<string, unknown>;
        };
        handler({
          name: decoded.eventName,
          args: weiArgsToPlanck(decoded.eventName, decoded.args),
        } as unknown as TambolaEvent);
      } catch { /* not one of ours or malformed */ }
    },
  });
  return () => sub.unsubscribe();
}
