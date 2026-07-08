/**
 * Tambola Cloudflare worker. Runs outside the Triangle sandbox, so it talks
 * to the chain directly over WebSocket PAPI and signs with its own sr25519
 * key (SIGNER_MNEMONIC secret). Cron dispatch:
 *
 *   every minute (drawer)    — Cloudflare crons bottom out at one minute, so a
 *                              single invocation ticks `drawNumber` at the
 *                              contract's DRAW_INTERVAL_SECONDS cadence until
 *                              ~52 s in, then exits and lets the next
 *                              invocation take over.
 *   every 5 minutes (indexer) — snapshots every non-final game into D1.
 *
 * `drawNumber` is permissionless and the contract enforces the cadence, so
 * this worker racing the bundled host worker is safe — the loser's dry-run
 * reverts "too soon" and nothing is submitted.
 */

import { createClient, Binary } from "polkadot-api";
import { getWsProvider } from "polkadot-api/ws";
import { getPolkadotSigner, type PolkadotSigner } from "polkadot-api/signer";
import { sr25519CreateDerive } from "@polkadot-labs/hdkd";
import { DEV_PHRASE, entropyToMiniSecret, mnemonicToEntropy, ss58Address } from "@polkadot-labs/hdkd-helpers";
import { bytesToHex, encodeFunctionData, decodeFunctionResult, type Abi } from "viem";
import { ss58ToH160 } from "@parity/product-sdk-address";

import { TAMBOLA_ABI, type GameView } from "../../src/lib/tambola/abi";

interface Env {
  DB: D1Database;
  CHAIN_RPC: string;
  TAMBOLA_ADDRESS: `0x${string}`;
  READ_ONLY_ORIGIN: string;
  SIGNER_MNEMONIC?: string;
  SIGNER_DERIVATION?: string;
}

const DRAWER_CRON = "* * * * *";
const INDEXER_CRON = "*/5 * * * *";
// Leave headroom before the next minute's invocation starts.
const DRAWER_BUDGET_MS = 52_000;
const FALLBACK_DRAW_INTERVAL = 12n;

const nowSeconds = () => BigInt(Math.floor(Date.now() / 1000));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function connect(env: Env) {
  const client = createClient(getWsProvider(env.CHAIN_RPC));
  const unsafe = (client as unknown as { getUnsafeApi: () => any }).getUnsafeApi();
  return { client, unsafe };
}

function makeSigner(env: Env): { signer: PolkadotSigner; address: string } {
  const entropy = mnemonicToEntropy(env.SIGNER_MNEMONIC ?? DEV_PHRASE);
  const keypair = sr25519CreateDerive(entropyToMiniSecret(entropy))(env.SIGNER_DERIVATION ?? "");
  return {
    signer: getPolkadotSigner(keypair.publicKey, "Sr25519", keypair.sign),
    address: ss58Address(keypair.publicKey),
  };
}

async function readContract<T>(unsafe: any, env: Env, functionName: string, args: readonly unknown[] = []): Promise<T> {
  const calldata = encodeFunctionData({ abi: TAMBOLA_ABI as Abi, functionName, args });
  // PAPI v2 + metadata v16: H160 params are hex strings, Bytes results are Uint8Array.
  const dryRun = await unsafe.apis.ReviveApi.call(
    env.READ_ONLY_ORIGIN, env.TAMBOLA_ADDRESS.toLowerCase(), 0n, undefined, undefined,
    Binary.fromHex(calldata), { at: "best" },
  );
  if (!dryRun.result.success) throw new Error(`dry-run failed for ${functionName}`);
  if (dryRun.result.value.flags & 1) throw new Error(`contract reverted in ${functionName}`);
  const raw = dryRun.result.value.data;
  const data = (typeof raw === "string" ? raw : bytesToHex(raw.asBytes?.() ?? raw)) as `0x${string}`;
  return decodeFunctionResult({ abi: TAMBOLA_ABI as Abi, functionName, data }) as T;
}

async function readAllGames(unsafe: any, env: Env): Promise<Array<GameView & { id: bigint }>> {
  const nextGameId = await readContract<bigint>(unsafe, env, "nextGameId");
  const games: Array<GameView & { id: bigint }> = [];
  for (let id = 1n; id <= nextGameId; id++) {
    games.push({ id, ...(await readContract<GameView>(unsafe, env, "getGame", [id])) });
  }
  return games;
}

// ---- drawer ---------------------------------------------------------------

async function submitDraw(unsafe: any, env: Env, signer: PolkadotSigner, signerAddress: string, gameId: bigint) {
  const calldata = encodeFunctionData({ abi: TAMBOLA_ABI as Abi, functionName: "drawNumber", args: [gameId] });
  const dest = env.TAMBOLA_ADDRESS.toLowerCase() as `0x${string}`;
  const data = Binary.fromHex(calldata);

  // The runtime rejects both dry-runs and calls from unmapped origins.
  const h160 = ss58ToH160(signerAddress);
  const isMapped = (await unsafe.query.Revive.OriginalAccount.getValue(h160)) !== undefined;

  const dryRun = await unsafe.apis.ReviveApi.call(
    isMapped ? signerAddress : env.READ_ONLY_ORIGIN, dest, 0n, undefined, undefined, data,
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

  // Resolve on best-block inclusion — waiting for finality would eat the
  // 12 s cadence budget; the contract re-checks everything anyway.
  await new Promise<void>((resolve, reject) => {
    const sub = tx.signSubmitAndWatch(signer, { mortality: { mortal: true, period: 64 } }).subscribe({
      next: (e: any) => {
        if ((e.type === "txBestBlocksState" && e.found) || e.type === "finalized") {
          sub.unsubscribe();
          e.ok ? resolve() : reject(new Error("draw dispatch error"));
        }
      },
      error: (e: any) => { sub.unsubscribe(); reject(e); },
    });
  });
}

async function runDrawer(env: Env, startedAtMs: number) {
  const { client, unsafe } = await connect(env);
  try {
    const { signer, address } = makeSigner(env);
    const interval = await readContract<number>(unsafe, env, "DRAW_INTERVAL_SECONDS")
      .then(BigInt)
      .catch(() => FALLBACK_DRAW_INTERVAL);

    const candidates = (await readAllGames(unsafe, env))
      .filter((g) => (g.state === 0 || g.state === 1) && g.ticketCount > 0);
    if (candidates.length === 0) return;

    const lastDraw = new Map(candidates.map((g) => [g.id, g.lastDrawTime]));
    const deadline = startedAtMs + DRAWER_BUDGET_MS;

    while (Date.now() < deadline) {
      for (const g of candidates) {
        const now = nowSeconds();
        if (now < g.startTime) continue;
        if (now < (lastDraw.get(g.id) ?? 0n) + interval) continue;
        try {
          await submitDraw(unsafe, env, signer, address, g.id);
          console.log(`drew for game ${g.id} as ${address}`);
        } catch (e) {
          console.error(`draw failed for game ${g.id}:`, e);
        }
        // Success or failure, wait a full interval before this game's next try.
        lastDraw.set(g.id, nowSeconds());
      }
      await sleep(1_000);
    }
  } finally {
    client.destroy();
  }
}

// ---- indexer ---------------------------------------------------------------

async function runIndexer(env: Env) {
  const { client, unsafe } = await connect(env);
  try {
    // Final games (Won / NoWinner) never change again — index them once.
    const finalRows = await env.DB
      .prepare("SELECT game_id FROM games WHERE state >= 2")
      .all<{ game_id: number }>();
    const finalIds = new Set(finalRows.results.map((r) => r.game_id));

    const nextGameId = await readContract<bigint>(unsafe, env, "nextGameId");
    const upserts: D1PreparedStatement[] = [];
    for (let id = 1n; id <= nextGameId; id++) {
      if (finalIds.has(Number(id))) continue;
      const g = await readContract<GameView>(unsafe, env, "getGame", [id]);
      const drawn = await readContract<readonly number[]>(unsafe, env, "getDrawnNumbers", [id]);
      upserts.push(
        env.DB.prepare(
          `INSERT INTO games (game_id, host, ticket_price, start_time, last_draw_time,
             ticket_count, pot, state, top_line_winner, middle_line_winner,
             bottom_line_winner, fullhouse_winner, drawn_numbers, indexed_at)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)
           ON CONFLICT(game_id) DO UPDATE SET
             last_draw_time = excluded.last_draw_time,
             ticket_count   = excluded.ticket_count,
             pot            = excluded.pot,
             state          = excluded.state,
             top_line_winner    = excluded.top_line_winner,
             middle_line_winner = excluded.middle_line_winner,
             bottom_line_winner = excluded.bottom_line_winner,
             fullhouse_winner   = excluded.fullhouse_winner,
             drawn_numbers  = excluded.drawn_numbers,
             indexed_at     = excluded.indexed_at`,
        ).bind(
          Number(id), g.host, g.ticketPrice.toString(), Number(g.startTime), Number(g.lastDrawTime),
          g.ticketCount, g.pot.toString(), g.state, g.topLineWinner, g.middleLineWinner,
          g.bottomLineWinner, g.fullhouseWinner, JSON.stringify(Array.from(drawn)), Number(nowSeconds()),
        ),
      );
    }
    if (upserts.length > 0) await env.DB.batch(upserts);
    console.log(`indexed ${upserts.length} game(s) of ${nextGameId}`);
  } finally {
    client.destroy();
  }
}

// ---- entry -----------------------------------------------------------------

export default {
  async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext) {
    const startedAtMs = Date.now();
    switch (controller.cron) {
      case DRAWER_CRON:  ctx.waitUntil(runDrawer(env, startedAtMs)); break;
      case INDEXER_CRON: ctx.waitUntil(runIndexer(env)); break;
      default: console.warn("unknown cron", controller.cron);
    }
  },

  // Read-only peek at the index: GET /games
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/games") {
      const rows = await env.DB.prepare("SELECT * FROM games ORDER BY game_id DESC").all();
      return Response.json(rows.results);
    }
    return new Response("tambola-worker: try /games", { status: 404 });
  },
};
