/**
 * Tambola worker.
 *
 * Two jobs:
 *   1. Listen for `GameCreated` events from the Tambola contract and register
 *      a chat room per game id so players in that game can talk.
 *      Marks the room as closed (system message) on `GameWon` /
 *      `GameEndedNoWinner`.
 *
 *   2. Drive the game forward by calling `drawNumber(gameId)` once
 *      `current_block >= startBlock + lastDrawBlock + 4`. `drawNumber` is
 *      permissionless so the worker is a convenience, not a trust anchor — a
 *      player can still poke the game forward from the browser.
 *
 * Runs inside the Polkadot Triangle host worker sandbox (chat: true in
 * bulletin-deploy.config.ts). No filesystem or direct HTTP allowed.
 */

import { createClient, Binary } from "polkadot-api";
import { encodeFunctionData, decodeEventLog, type Abi } from "viem";
import {
  getChatManager,
  getHostProvider,
  getHostSigner,
} from "@parity/product-sdk-host";

import { TAMBOLA_ABI } from "../src/lib/tambola/abi";
import { TAMBOLA_ADDRESS, CHAIN } from "../src/lib/chain/constants";

const BLOCKS_BETWEEN_DRAWS = 4;

interface ActiveGame {
  startBlock: bigint;
  lastDrawBlock: bigint;
  state: number;        // 0=Pending 1=Live 2=Won 3=NoWinner
  pendingTx: boolean;
}

const active = new Map<string, ActiveGame>();

function roomId(gameId: bigint) { return `tambola-${gameId.toString()}`; }

async function main() {
  const chat = await getChatManager();
  if (!chat) {
    console.warn("[tambola-worker] no chat manager available");
  }

  const provider = await getHostProvider(CHAIN.genesis);
  if (!provider) throw new Error("worker: no host provider");
  const client = createClient(provider);
  const unsafe = (client as unknown as { getUnsafeApi: () => any }).getUnsafeApi();

  const signer = await getHostSigner();  // worker has a worker-scoped signer
  if (!signer) throw new Error("worker: no host signer");
  const signerAddress = (signer as any).address ?? (signer as any).publicKey;

  // ---- chat room creation + closure on game-end events -------------------
  const evSub = unsafe.event.Revive.ContractEmitted.watch().subscribe({
    next: async (ev: any) => {
      const contract: string = (ev.payload?.contract ?? "").toLowerCase();
      if (contract !== TAMBOLA_ADDRESS.toLowerCase()) return;
      const data:   `0x${string}`   = ev.payload.data?.asHex?.() ?? ev.payload.data;
      const topics: `0x${string}`[] = (ev.payload.topics ?? []).map((t: any) => t.asHex?.() ?? t);
      let decoded: any;
      try { decoded = decodeEventLog({ abi: TAMBOLA_ABI as Abi, data, topics }); } catch { return; }

      const gameId = decoded.args.gameId as bigint;
      const key = gameId.toString();

      if (decoded.eventName === "GameCreated") {
        if (chat) {
          const status = await chat.registerRoom({
            roomId: roomId(gameId),
            name:   `Tambola #${gameId.toString()}`,
            icon:   "",
          });
          if (status === "New") {
            await chat.sendMessage(roomId(gameId), {
              tag: "Text",
              value: `Welcome to Tambola #${gameId.toString()}. Good luck! 🎯`,
            });
          }
        }
        active.set(key, {
          startBlock:    decoded.args.startBlock as bigint,
          lastDrawBlock: 0n,
          state:         0,
          pendingTx:     false,
        });
      } else if (decoded.eventName === "NumberDrawn") {
        const a = active.get(key);
        if (a) {
          a.lastDrawBlock = decoded.args.blockNumber as bigint;
          a.state         = 1;
          a.pendingTx     = false;
        }
      } else if (decoded.eventName === "GameWon") {
        if (chat) {
          await chat.sendMessage(roomId(gameId), {
            tag: "Text",
            value: `🏆 Full house! Game over.`,
          });
        }
        const a = active.get(key); if (a) a.state = 2;
        active.delete(key);
      } else if (decoded.eventName === "GameEndedNoWinner") {
        if (chat) {
          await chat.sendMessage(roomId(gameId), {
            tag: "Text",
            value: `Game ended without a full house — refunds available.`,
          });
        }
        const a = active.get(key); if (a) a.state = 3;
        active.delete(key);
      }
    },
  });

  // ---- per-block draw poker ---------------------------------------------
  const blockSub = client.bestBlocks$.subscribe({
    next: async (blocks: any) => {
      const head = blocks[0];
      if (!head) return;
      const blockNumber = BigInt(head.number);

      for (const [key, g] of active) {
        if (g.state !== 0 && g.state !== 1) continue;
        if (g.pendingTx) continue;
        if (blockNumber < g.startBlock) continue;
        if (g.lastDrawBlock !== 0n && blockNumber < g.lastDrawBlock + BigInt(BLOCKS_BETWEEN_DRAWS)) continue;

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
  const dest = Binary.fromHex(TAMBOLA_ADDRESS.toLowerCase());
  const data = Binary.fromHex(calldata);

  const dryRun = await unsafe.apis.ReviveApi.call(
    signerAddress, dest, 0n, undefined, undefined, data,
  );
  if (!dryRun.result.success) throw new Error("draw dry-run failed");
  if (dryRun.result.value.flags & 1) throw new Error("draw reverted");

  const tx = unsafe.tx.Revive.call({
    dest,
    value: 0n,
    weight_limit: {
      ref_time:   dryRun.weight_required.ref_time   * 4n,
      proof_size: dryRun.weight_required.proof_size * 4n,
    },
    storage_deposit_limit: dryRun.storage_deposit?.value,
    data,
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
