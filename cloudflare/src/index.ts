/**
 * Tambola Cloudflare worker. Runs outside the Triangle sandbox, so it talks
 * to the chain directly over WebSocket PAPI and signs with its own sr25519
 * key (SIGNER_MNEMONIC secret). Cron dispatch:
 *
 *   every minute (drawer)    — Cloudflare crons bottom out at one minute, so a
 *                              single invocation ticks `drawNumber` at the
 *                              contract's DRAW_INTERVAL_SECONDS cadence until
 *                              ~52 s in, then exits and lets the next
 *                              invocation take over. Also announces game
 *                              milestones (welcome / won / no winner) to each
 *                              game's statement-store chat room, connecting in
 *                              local mode (no host needed) and deduping via
 *                              the D1 `announcements` table.
 *   every 5 minutes (indexer) — snapshots every non-final game into D1.
 *
 * `drawNumber` is permissionless and the contract enforces the cadence, so
 * this worker racing the bundled host worker is safe — the loser's dry-run
 * reverts "too soon" and nothing is submitted.
 */

import { createClient } from "polkadot-api";
import { getWsProvider } from "polkadot-api/ws";
import { getPolkadotSigner, type PolkadotSigner } from "polkadot-api/signer";
import { sr25519CreateDerive } from "@polkadot-labs/hdkd";
import { DEV_PHRASE, entropyToMiniSecret, mnemonicToEntropy, ss58Address } from "@polkadot-labs/hdkd-helpers";
import {
  createContract,
  createContractRuntime,
  ensureContractAccountMapped,
  type AbiEntry,
  type Contract,
  type ContractDef,
  type ContractRuntime,
  type ReviveTypedApi,
} from "@parity/product-sdk-contracts";
import { encodeData } from "@parity/product-sdk-statement-store";
import {
  createLazyClient,
  createPapiStatementStoreAdapter,
  createSr25519Prover,
  createSr25519Secret,
} from "@novasamatech/statement-store";
import { stringToTopic, createExpiryFromDuration } from "@novasamatech/sdk-statement";

import { TAMBOLA_ABI, type GameView } from "../../src/lib/tambola/abi";
import { CHAT_APP_NAME, CHAT_TTL_SECONDS, roomIdForGame, type ChatPayload } from "../../src/lib/chat/protocol";

interface Env {
  DB: D1Database;
  CHAIN_RPC: string;
  STATEMENT_RPC: string;
  TAMBOLA_ADDRESS: `0x${string}`;
  READ_ONLY_ORIGIN: string;
  SIGNER_MNEMONIC?: string;
  SIGNER_DERIVATION?: string;
}

const DRAWER_CRON = "* * * * *";
const INDEXER_CRON = "*/5 * * * *";
// Leave headroom before the next minute's invocation starts.
const DRAWER_BUDGET_MS = 52_000;
const FALLBACK_DRAW_INTERVAL = 6n;

const nowSeconds = () => BigInt(Math.floor(Date.now() / 1000));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// The contract judges everything by block.timestamp, which can lag wall clock
// by many seconds on this testnet — gating draws on Date.now() causes
// "not started" / "too soon" reverts. Always compare against chain time.
const chainNowSeconds = async (unsafe: any): Promise<bigint> =>
  BigInt(await unsafe.query.Timestamp.Now.getValue({ at: "best" })) / 1000n;

interface Chain {
  client: ReturnType<typeof createClient>;
  unsafe: any;
  runtime: ContractRuntime;
  tambola: Contract<ContractDef>;
}

// The unsafe API structurally satisfies ReviveTypedApi and skips PAPI's
// compat-token checks — no descriptor bundle needed in the worker.
function connect(env: Env): Chain {
  const client = createClient(getWsProvider(env.CHAIN_RPC));
  const unsafe = (client as unknown as { getUnsafeApi: () => any }).getUnsafeApi();
  const runtime = createContractRuntime(unsafe as ReviveTypedApi, { at: "best" });
  const tambola = createContract(runtime, env.TAMBOLA_ADDRESS, TAMBOLA_ABI as unknown as AbiEntry[], {
    defaultOrigin: env.READ_ONLY_ORIGIN,
  });
  return { client, unsafe, runtime, tambola };
}

function makeSigner(env: Env): { signer: PolkadotSigner; address: string } {
  const entropy = mnemonicToEntropy(env.SIGNER_MNEMONIC ?? DEV_PHRASE);
  const keypair = sr25519CreateDerive(entropyToMiniSecret(entropy))(env.SIGNER_DERIVATION ?? "");
  return {
    signer: getPolkadotSigner(keypair.publicKey, "Sr25519", keypair.sign),
    address: ss58Address(keypair.publicKey),
  };
}

async function readContract<T>(tambola: Contract<ContractDef>, functionName: string, args: readonly unknown[] = []): Promise<T> {
  const handle = (tambola as unknown as Record<string, { query: (...a: unknown[]) => Promise<{ success: boolean; value: unknown }> }>)[functionName];
  if (!handle) throw new Error(`unknown contract method ${functionName}`);
  const result = await handle.query(...args);
  if (!result.success) throw new Error(`dry-run failed for ${functionName}`);
  return result.value as T;
}

async function readAllGames(tambola: Contract<ContractDef>): Promise<Array<GameView & { id: bigint }>> {
  const nextGameId = await readContract<bigint>(tambola, "nextGameId");
  const games: Array<GameView & { id: bigint }> = [];
  for (let id = 1n; id <= nextGameId; id++) {
    games.push({ id, ...(await readContract<GameView>(tambola, "getGame", [id])) });
  }
  return games;
}

// ---- chat announcements -----------------------------------------------------

// A cron worker can't hold a live event subscription, so milestones are
// detected by diffing chain state against the D1 `announcements` table each
// drawer run (≤1 min lag). Statements are published directly to the People
// chain statement-store RPC (no host needed); topic and payload encoding match
// the host-mode SDK the app subscribes with (blake2b topics, JSON data).
// Announcements are a nicety: a failed publish (e.g. the account still lacks
// its statement allowance) is logged, left unmarked, and retried next
// invocation — never allowed to stall the draws.
async function announceMilestones(env: Env, games: Array<GameView & { id: bigint }>) {
  const done = new Set(
    (await env.DB.prepare("SELECT game_id, kind FROM announcements").all<{ game_id: number; kind: string }>())
      .results.map((r) => `${r.game_id}:${r.kind}`),
  );

  const pending: Array<{ id: bigint; kind: string; text: string }> = [];
  for (const g of games) {
    // Don't welcome games that were already over before we ever saw them.
    if (g.state <= 1 && !done.has(`${g.id}:welcome`))
      pending.push({ id: g.id, kind: "welcome", text: `Welcome to Tambola #${g.id}. Good luck! 🎯` });
    if (g.state === 2 && !done.has(`${g.id}:won`))
      pending.push({ id: g.id, kind: "won", text: "🏆 Full house! Game over." });
    if (g.state === 3 && !done.has(`${g.id}:no-winner`))
      pending.push({ id: g.id, kind: "no-winner", text: "Game ended without a full house — refunds available." });
  }
  if (pending.length === 0) return;

  const lazyClient = createLazyClient(getWsProvider(env.STATEMENT_RPC));
  const adapter = createPapiStatementStoreAdapter(lazyClient);
  const secret = createSr25519Secret(mnemonicToEntropy(env.SIGNER_MNEMONIC ?? DEV_PHRASE), env.SIGNER_DERIVATION ?? "");
  const prover = createSr25519Prover(secret);

  try {
    for (const p of pending) {
      try {
        const payload: ChatPayload = { text: p.text, name: "Tambola" };
        const signed = await prover.generateMessageProof({
          topics: [stringToTopic(CHAT_APP_NAME), stringToTopic(roomIdForGame(p.id))],
          data: encodeData(payload),
          expiry: createExpiryFromDuration(CHAT_TTL_SECONDS),
        });
        if (signed.isErr()) throw signed.error;
        const submitted = await adapter.submitStatement(signed._unsafeUnwrap());
        if (submitted.isErr()) throw submitted.error;
        await env.DB
          .prepare("INSERT OR IGNORE INTO announcements (game_id, kind, announced_at) VALUES (?1, ?2, ?3)")
          .bind(Number(p.id), p.kind, Number(nowSeconds()))
          .run();
        console.log(`announced ${p.kind} for game ${p.id}`);
      } catch (e) {
        console.warn(`announce failed for game ${p.id} (${p.kind}):`, e);
      }
    }
  } finally {
    try { lazyClient.disconnect(); } catch { /* already closed */ }
  }
}

// ---- drawer ---------------------------------------------------------------

async function submitDraw(tambola: Contract<ContractDef>, signer: PolkadotSigner, signerAddress: string, gameId: bigint) {
  const handle = (tambola as unknown as { drawNumber: { tx: (...a: unknown[]) => Promise<{ ok: boolean; dispatchError?: unknown }> } }).drawNumber;
  // Resolve on best-block inclusion — waiting for finality would eat the
  // draw-cadence budget; the contract re-checks everything anyway.
  const result = await handle.tx(gameId, {
    signer,
    origin: signerAddress,
    mortalityPeriod: 64,
    waitFor: "best-block",
  });
  if (!result.ok) throw new Error(`draw dispatch error: ${JSON.stringify(result.dispatchError, (_, v) => (typeof v === "bigint" ? v.toString() : v))}`);
}

async function runDrawer(env: Env, startedAtMs: number) {
  const { client, unsafe, runtime, tambola } = connect(env);
  try {
    const { signer, address } = makeSigner(env);
    const interval = await readContract<number>(tambola, "DRAW_INTERVAL_SECONDS")
      .then(BigInt)
      .catch(() => FALLBACK_DRAW_INTERVAL);

    const games = await readAllGames(tambola);
    await announceMilestones(env, games);

    const candidates = games.filter((g) => (g.state === 0 || g.state === 1) && g.ticketCount > 0);
    if (candidates.length === 0) return;

    // The runtime rejects both dry-runs and calls from unmapped origins;
    // idempotent fast-path once the drawer account is mapped.
    await ensureContractAccountMapped(runtime, address, signer);

    const active = new Map(candidates.map((g) => [g.id, { startTime: g.startTime, lastDraw: g.lastDrawTime }]));
    const deadline = startedAtMs + DRAWER_BUDGET_MS;

    while (Date.now() < deadline && active.size > 0) {
      const chainNow = await chainNowSeconds(unsafe);
      for (const [id, g] of active) {
        if (chainNow < g.startTime) continue;
        if (chainNow < g.lastDraw + interval) continue;
        try {
          await submitDraw(tambola, signer, address, id);
          console.log(`drew for game ${id} as ${address}`);
        } catch (e) {
          console.error(`draw failed for game ${id}:`, e);
        }
        // Success or failure, wait a full interval before this game's next
        // try — re-read chain time so the inclusion block's timestamp counts.
        g.lastDraw = await chainNowSeconds(unsafe);
        // A draw can end the game (full house, or all 90 drawn) — re-read the
        // state and retire finished games so we never draw past a winner.
        const fresh = await readContract<GameView>(tambola, "getGame", [id]).catch(() => null);
        if (fresh && fresh.state >= 2) {
          active.delete(id);
          console.log(`game ${id} reached final state ${fresh.state}; draws stopped`);
        }
      }
      await sleep(1_000);
    }
  } finally {
    client.destroy();
  }
}

// ---- indexer ---------------------------------------------------------------

async function runIndexer(env: Env) {
  const { client, tambola } = connect(env);
  try {
    // Final games (Won / NoWinner) never change again — index them once.
    const finalRows = await env.DB
      .prepare("SELECT game_id FROM games WHERE state >= 2")
      .all<{ game_id: number }>();
    const finalIds = new Set(finalRows.results.map((r) => r.game_id));

    const nextGameId = await readContract<bigint>(tambola, "nextGameId");
    const upserts: D1PreparedStatement[] = [];
    for (let id = 1n; id <= nextGameId; id++) {
      if (finalIds.has(Number(id))) continue;
      const g = await readContract<GameView>(tambola, "getGame", [id]);
      const drawn = await readContract<readonly number[]>(tambola, "getDrawnNumbers", [id]);
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
          g.ticketCount, g.pot.toString(), g.state,
          JSON.stringify(g.topLineWinners), JSON.stringify(g.middleLineWinners),
          JSON.stringify(g.bottomLineWinners), JSON.stringify(g.fullhouseWinners),
          JSON.stringify(Array.from(drawn)), Number(nowSeconds()),
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
