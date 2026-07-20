/**
 * Tambola contract event subscription.
 *
 * pallet-revive emits Solidity events as raw `ContractEmitted` system events
 * with `(contract, data, topics[])` fields. We watch them via the runtime's
 * PAPI client, filter by our contract address, and decode against the ABI.
 * Every Tambola event arg is a static 32-byte word, so no general ABI codec
 * is needed.
 */

import { keccak_256 } from "@noble/hashes/sha3.js";
import { truapi } from "@/lib/truapi";
import { NATIVE_TO_ETH_RATIO, TAMBOLA_ADDRESS } from "@/lib/chain/constants";
import { TAMBOLA_ABI } from "./abi";

/** All amounts are converted from the contract's 18-dec wei to native planck. */
export type TambolaEvent =
  | { name: "GameCreated";       args: { gameId: bigint; host: `0x${string}`; startTime: bigint; ticketPrice: bigint } }
  | { name: "TicketBought";      args: { gameId: bigint; player: `0x${string}`; ticketId: bigint; hash: `0x${string}` } }
  | { name: "NumberDrawn";       args: { gameId: bigint; number: number; drawnAt: bigint } }
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

// ---- event codec --------------------------------------------------------

interface AbiEventInput { name: string; type: string; indexed: boolean }
interface AbiEvent { type: "event"; name: string; inputs: readonly AbiEventInput[] }

const utf8 = new TextEncoder();
const toHex = (bytes: Uint8Array) =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");

function eventTopic0(e: AbiEvent): string {
  const signature = `${e.name}(${e.inputs.map((i) => i.type).join(",")})`;
  return `0x${toHex(keccak_256(utf8.encode(signature)))}`;
}

// EIP-55, so event args compare equal (`===`) to the checksummed addresses
// the read path decodes — the game store dedupes winners by string equality.
function checksumAddress(word: string): `0x${string}` {
  const addr = word.slice(-40).toLowerCase();
  const hash = toHex(keccak_256(utf8.encode(addr)));
  let out = "0x";
  for (let i = 0; i < 40; i++) {
    out += parseInt(hash[i], 16) >= 8 ? addr[i].toUpperCase() : addr[i];
  }
  return out as `0x${string}`;
}

function decodeWord(type: string, word: string): unknown {
  if (type === "address") return checksumAddress(word);
  if (type.startsWith("bytes")) return `0x${word}`;
  const value = BigInt(`0x${word}`);
  const bits = Number(type.slice(4) || "256");
  return bits <= 32 ? Number(value) : value;
}

const EVENTS_BY_TOPIC = new Map<string, AbiEvent>(
  (TAMBOLA_ABI as readonly unknown[])
    .filter((e): e is AbiEvent => (e as AbiEvent).type === "event")
    .map((e) => [eventTopic0(e), e]),
);

function decodeTambolaEvent(data: string, topics: string[]): TambolaEvent | null {
  const event = EVENTS_BY_TOPIC.get(topics[0]?.toLowerCase() ?? "");
  if (!event) return null;
  const dataWords = data.replace(/^0x/, "").match(/.{64}/g) ?? [];
  const args: Record<string, unknown> = {};
  let topicIdx = 1;
  let dataIdx = 0;
  for (const input of event.inputs) {
    const word = input.indexed ? topics[topicIdx++]?.replace(/^0x/, "") : dataWords[dataIdx++];
    if (word === undefined) return null;
    args[input.name] = decodeWord(input.type, word);
  }
  return { name: event.name, args: weiArgsToPlanck(event.name, args) } as TambolaEvent;
}

// ---- subscription -------------------------------------------------------

/** Subscribe to all Tambola events on the contract. Returns a teardown fn. */
export async function subscribeEvents(handler: (e: TambolaEvent) => void): Promise<Unsubscribe> {
  const client = await truapi.chains.getClient();
  const unsafe = (client as unknown as { getUnsafeApi: () => any }).getUnsafeApi();

  // PAPI v2 + metadata v16: H160/H256 fields are hex strings, Bytes are Uint8Array.
  const toHexString = (v: any): `0x${string}` =>
    typeof v === "string" ? (v as `0x${string}`) : v?.asHex?.() ?? `0x${toHex(v)}`;

  // watchBest emits `{ type, block, events }` per block — one emission holds
  // ALL matching events of that block as `{ original, payload }` entries.
  // "new" best-block events keep the UI as live as the app's `at: "best"`
  // reads; a reorg can theoretically drop one, which we accept like any read
  // at "best" ("finalized"/"drop" emissions would double- or un-apply, so
  // they are skipped).
  const sub = unsafe.event.Revive.ContractEmitted.watchBest().subscribe({
    next: (emission: any) => {
      if (emission?.type !== "new") return;
      for (const { payload } of emission.events ?? []) {
        const contract = toHexString(payload?.contract ?? "0x").toLowerCase();
        if (contract !== TAMBOLA_ADDRESS.toLowerCase()) continue;
        const data = toHexString(payload.data);
        const topics = (payload.topics ?? []).map(toHexString);
        const decoded = decodeTambolaEvent(data, topics);
        if (decoded) handler(decoded);
      }
    },
    error: (e: unknown) => console.error("Tambola event subscription died:", e),
  });
  return () => sub.unsubscribe();
}
