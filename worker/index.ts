/**
 * Tambola worker (Triangle host sandbox — no filesystem, no direct HTTP).
 *
 * Two jobs:
 *   1. Announce game milestones (welcome / full house / no winner) in each
 *      game's statement-store chat room, keyed by contract events.
 *   2. Drive the game forward by calling `drawNumber(gameId)` once
 *      `block.timestamp >= startTime` and `DRAW_INTERVAL_SECONDS` since the
 *      last draw. `drawNumber` is permissionless so the worker is a
 *      convenience, not a trust anchor — a player can still poke the game
 *      forward from the browser.
 *
 * On startup it scans `nextGameId`/`getGame` so a restarted worker resumes
 * driving games that were created while it was down.
 */

import { createClient, Binary } from "polkadot-api";
import { bytesToHex, encodeFunctionData, decodeFunctionResult, decodeEventLog, type Abi } from "viem";
import { getHostProvider } from "@parity/product-sdk-host";
import { StatementStoreClient } from "@parity/product-sdk-statement-store";

import { ss58ToH160 } from "@parity/product-sdk-address";
import { CHAT_APP_NAME, CHAT_TTL_SECONDS, roomIdForGame, type ChatPayload } from "../src/lib/chat/protocol";
import { TAMBOLA_ABI, type GameView } from "../src/lib/tambola/abi";
import { DRAW_INTERVAL_SECONDS, READ_ONLY_ORIGIN, TAMBOLA_ADDRESS, CHAIN } from "../src/lib/chain/constants";
import { ensureSignerConnected, signerManager } from "../src/lib/chain/signer";

interface ActiveGame {
  startTime: bigint;      // unix seconds
  lastDrawTime: bigint;   // unix seconds; 0 until the first draw
  hasTickets: boolean;
  state: number;          // 0=Pending 1=Live
  pendingTx: boolean;
}

const active = new Map<string, ActiveGame>();

const nowSeconds = () => BigInt(Math.floor(Date.now() / 1000));

async function connectChat(): Promise<StatementStoreClient | null> {
  try {
    const client = new StatementStoreClient({
      appName: CHAT_APP_NAME,
      defaultTtlSeconds: CHAT_TTL_SECONDS,
    });
    await client.connect({ mode: "host" });
    return client;
  } catch (e) {
    console.warn("[tambola-worker] statement store unavailable", e);
    return null;
  }
}

async function announce(chat: StatementStoreClient | null, gameId: bigint, text: string) {
  if (!chat) return;
  try {
    await chat.publish<ChatPayload>({ text, name: "Tambola" }, { topic2: roomIdForGame(gameId) });
  } catch (e) {
    console.warn("[tambola-worker] announce failed", gameId.toString(), e);
  }
}

async function readContract<T>(unsafe: any, functionName: string, args: readonly unknown[] = []): Promise<T> {
  const calldata = encodeFunctionData({ abi: TAMBOLA_ABI as Abi, functionName, args });
  const dryRun = await unsafe.apis.ReviveApi.call(
    READ_ONLY_ORIGIN, TAMBOLA_ADDRESS.toLowerCase(), 0n, undefined, undefined,
    Binary.fromHex(calldata), { at: "best" },
  );
  if (!dryRun.result.success) throw new Error(`dry-run failed for ${functionName}`);
  if (dryRun.result.value.flags & 1) throw new Error(`contract reverted in ${functionName}`);
  const raw = dryRun.result.value.data;
  const data = (typeof raw === "string" ? raw : bytesToHex(raw.asBytes?.() ?? raw)) as `0x${string}`;
  return decodeFunctionResult({ abi: TAMBOLA_ABI as Abi, functionName, data }) as T;
}

/** Seed `active` from chain state so a restart resumes in-flight games. */
async function bootstrapActiveGames(unsafe: any) {
  const nextGameId = await readContract<bigint>(unsafe, "nextGameId");
  for (let id = 1n; id <= nextGameId; id++) {
    try {
      const g = await readContract<GameView>(unsafe, "getGame", [id]);
      if (g.state !== 0 && g.state !== 1) continue;
      active.set(id.toString(), {
        startTime:    g.startTime,
        lastDrawTime: g.lastDrawTime,
        hasTickets:   g.ticketCount > 0,
        state:        g.state,
        pendingTx:    false,
      });
    } catch (e) {
      console.warn("[tambola-worker] bootstrap skipped game", id.toString(), e);
    }
  }
  console.log(`[tambola-worker] bootstrapped ${active.size} active game(s)`);
}

async function main() {
  const chat = await connectChat();

  const provider = await getHostProvider(CHAIN.genesis);
  if (!provider) throw new Error("worker: no host provider");
  const client = createClient(provider);
  const unsafe = (client as unknown as { getUnsafeApi: () => any }).getUnsafeApi();

  await ensureSignerConnected();
  const account = signerManager.getState().accounts[0];
  if (!account) throw new Error("worker: no signer account");
  const signer = account.getSigner();
  const signerAddress = account.address;

  await bootstrapActiveGames(unsafe);

  // PAPI v2 + metadata v16: H160/H256 fields are hex strings, Bytes are Uint8Array.
  const toHexString = (v: any): `0x${string}` =>
    typeof v === "string" ? (v as `0x${string}`) : v?.asHex?.() ?? bytesToHex(v);

  // ---- chat room creation + closure on game-end events -------------------
  const evSub = unsafe.event.Revive.ContractEmitted.watch().subscribe({
    next: async (ev: any) => {
      const contract = toHexString(ev.payload?.contract ?? "0x").toLowerCase();
      if (contract !== TAMBOLA_ADDRESS.toLowerCase()) return;
      const data = toHexString(ev.payload.data);
      const topics = (ev.payload.topics ?? []).map(toHexString) as [
        signature: `0x${string}`,
        ...args: `0x${string}`[],
      ];
      let decoded: any;
      try { decoded = decodeEventLog({ abi: TAMBOLA_ABI as Abi, data, topics }); } catch { return; }

      const gameId = decoded.args.gameId as bigint;
      const key = gameId.toString();

      if (decoded.eventName === "GameCreated") {
        await announce(chat, gameId, `Welcome to Tambola #${gameId.toString()}. Good luck! 🎯`);
        active.set(key, {
          startTime:    decoded.args.startTime as bigint,
          lastDrawTime: 0n,
          hasTickets:   false,
          state:        0,
          pendingTx:    false,
        });
      } else if (decoded.eventName === "TicketBought") {
        const a = active.get(key);
        if (a) a.hasTickets = true;
      } else if (decoded.eventName === "NumberDrawn") {
        const a = active.get(key);
        if (a) {
          a.lastDrawTime = decoded.args.drawnAt as bigint;
          a.state        = 1;
          a.pendingTx    = false;
        }
      } else if (decoded.eventName === "GameWon") {
        await announce(chat, gameId, `🏆 Full house! Game over.`);
        active.delete(key);
      } else if (decoded.eventName === "GameEndedNoWinner") {
        await announce(chat, gameId, `Game ended without a full house — refunds available.`);
        active.delete(key);
      }
    },
  });

  // ---- draw poker: each new best block is the clock tick ------------------
  const blockSub = client.bestBlocks$.subscribe({
    next: async () => {
      const now = nowSeconds();
      for (const [key, g] of active) {
        if (g.pendingTx || !g.hasTickets) continue;
        if (now < g.startTime) continue;
        if (now < g.lastDrawTime + BigInt(DRAW_INTERVAL_SECONDS)) continue;

        g.pendingTx = true;
        const gameId = BigInt(key);
        try {
          await pokeDraw(unsafe, signer, signerAddress, gameId);
        } catch (e) {
          console.error("[tambola-worker] draw failed", key, e);
          g.pendingTx = false;
        }
      }
    },
  });

  return () => {
    evSub.unsubscribe();
    blockSub.unsubscribe();
  };
}

async function pokeDraw(unsafe: any, signer: any, signerAddress: string, gameId: bigint) {
  const calldata = encodeFunctionData({
    abi: TAMBOLA_ABI as Abi,
    functionName: "drawNumber",
    args: [gameId],
  });
  // PAPI v2 + metadata v16: H160 params are hex strings, not Binary.
  const dest = TAMBOLA_ADDRESS.toLowerCase() as `0x${string}`;
  const data = Binary.fromHex(calldata);

  // The runtime rejects both dry-runs and calls from unmapped origins.
  const h160 = ss58ToH160(signerAddress);
  const isMapped = (await unsafe.query.Revive.OriginalAccount.getValue(h160)) !== undefined;

  const dryRun = await unsafe.apis.ReviveApi.call(
    isMapped ? signerAddress : READ_ONLY_ORIGIN, dest, 0n, undefined, undefined, data,
  );
  if (!dryRun.result.success) throw new Error("draw dry-run failed");
  if (dryRun.result.value.flags & 1) throw new Error("draw reverted");

  const reviveCall = unsafe.tx.Revive.call({
    dest,
    value: 0n,
    weight_limit: {
      ref_time:   dryRun.weight_required.ref_time   * 4n,
      proof_size: dryRun.weight_required.proof_size * 4n,
    },
    storage_deposit_limit: dryRun.storage_deposit?.value,
    data,
  });
  const tx = isMapped
    ? reviveCall
    : unsafe.tx.Utility.batch_all({
        calls: [unsafe.tx.Revive.map_account().decodedCall, reviveCall.decodedCall],
      });

  await new Promise<void>((resolve, reject) => {
    const sub = tx.signSubmitAndWatch(signer, { mortality: { mortal: true, period: 256 } }).subscribe({
      next: (e: any) => {
        if (e.type === "finalized") {
          if (!e.ok) { sub.unsubscribe(); reject(new Error("draw dispatch error")); return; }
          sub.unsubscribe(); resolve();
        }
      },
      error: (e: any) => { sub.unsubscribe(); reject(e); },
    });
  });
}

void main().catch((e) => console.error("[tambola-worker] fatal", e));
