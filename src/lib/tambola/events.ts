/**
 * Tambola contract event subscription.
 *
 * pallet-revive emits Solidity events as raw `ContractEmitted` system events
 * with `(contract, data, topics[])` fields. We watch them via PAPI, filter by
 * our contract address, and decode each one against the ABI with viem.
 */

import { decodeEventLog, type Abi } from "viem";
import { getClient } from "@/lib/chain/client";
import { TAMBOLA_ADDRESS } from "@/lib/chain/constants";
import { TAMBOLA_ABI } from "./abi";

export type TambolaEvent =
  | { name: "GameCreated";       args: { gameId: bigint; host: `0x${string}`; startTime: bigint; ticketPrice: bigint } }
  | { name: "TicketBought";      args: { gameId: bigint; player: `0x${string}`; ticketId: bigint; hash: `0x${string}` } }
  | { name: "NumberDrawn";       args: { gameId: bigint; number: number; blockNumber: bigint } }
  | { name: "LineWon";           args: { gameId: bigint; line: number; winner: `0x${string}`; payout: bigint } }
  | { name: "GameWon";           args: { gameId: bigint; winner: `0x${string}`; payout: bigint; host: `0x${string}`; hostFee: bigint } }
  | { name: "GameEndedNoWinner"; args: { gameId: bigint } }
  | { name: "RefundClaimed";     args: { gameId: bigint; player: `0x${string}`; amount: bigint } };

export type Unsubscribe = () => void;

/** Subscribe to all Tambola events on the contract. Returns a teardown fn. */
export async function subscribeEvents(handler: (e: TambolaEvent) => void): Promise<Unsubscribe> {
  const client = await getClient();
  const unsafe = (client as unknown as { getUnsafeApi: () => any }).getUnsafeApi();

  const sub = unsafe.event.Revive.ContractEmitted.watch().subscribe({
    next: (ev: any) => {
      const contract: string = (ev.payload?.contract ?? "").toLowerCase();
      if (contract !== TAMBOLA_ADDRESS.toLowerCase()) return;
      const data:   `0x${string}`   = ev.payload.data?.asHex?.()   ?? ev.payload.data;
      const topics = (ev.payload.topics ?? []).map((t: any) => t.asHex?.() ?? t) as [
        signature: `0x${string}`,
        ...args: `0x${string}`[],
      ];
      try {
        const decoded = decodeEventLog({ abi: TAMBOLA_ABI as Abi, data, topics });
        handler({ name: decoded.eventName, args: decoded.args } as unknown as TambolaEvent);
      } catch { /* not one of ours or malformed */ }
    },
  });
  return () => sub.unsubscribe();
}
