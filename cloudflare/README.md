# Tambola Cloudflare worker

> **Crons disabled 2026-07-20.** Draws, announcements, and indexing are now
> driven by polkadot-flow nodes running the tambola workflows from
> [polkadot-flow PR #31](https://github.com/paritytech/polkadot-flow/pull/31)

Cron-driven companion to the on-chain game. Two jobs, dispatched by cron
pattern in `src/index.ts`:

| Cron          | Job     | What it does                                                                 |
|---------------|---------|------------------------------------------------------------------------------|
| `* * * * *`   | drawer  | Calls `drawNumber` for every live game at the contract's 12 s cadence. Cloudflare crons can't fire sub-minute, so each invocation loops internally (~52 s) and hands over to the next. Also announces game milestones (welcome / full house / no winner) to each game's statement-store chat room — published directly to the People chain `statement_*` RPC (`STATEMENT_RPC`), deduped via the D1 `announcements` table. |
| `*/5 * * * *` | indexer | Snapshots every non-final game (`getGame` + `getDrawnNumbers`) into D1. Final games are indexed once and skipped afterwards. |

The drawer is a liveness convenience, not a trust anchor: `drawNumber` is
permissionless and the contract enforces the 12 s gap, so racing the bundled
host worker (or a player poking from the browser) is harmless.

`GET /games` on the deployed worker returns the D1 index as JSON.

## One-time setup

```bash
bun install

# 1. Create the D1 database, paste the printed database_id into wrangler.jsonc
bunx wrangler d1 create tambola-index

# 2. Apply the schema
bunx wrangler d1 execute tambola-index --remote --file=cloudflare/schema.sql

# 3. Set the drawing key (sr25519 mnemonic; optional SIGNER_DERIVATION e.g. "//Alice")
bunx wrangler secret put SIGNER_MNEMONIC --config cloudflare/wrangler.jsonc

# 4. Deploy
bun run cf:deploy
```

Fund the signer with PAS for fees — its SS58 address is logged on the first
draw (`drew for game N as <address>`). The first transaction self-maps the
account into pallet-revive (`Utility.batch_all` with `Revive.map_account`).

**Chat announcements need one extra permission:** the signer account must hold
a *statement-store allowance* on the People chain
(`paseo-people-next-system-rpc`). That allowance is runtime state granted via
Individuality personhood registration (`people_lite.attest` /
`Resources.set_statement_store_account`) or by the network operator — there is
no permissionless path. Until it's granted, the drawer logs
`announce failed … no allowance set for account` once per minute and keeps
retrying; announcements start flowing automatically once the allowance lands.
Draws and indexing are unaffected.

Keep `TAMBOLA_ADDRESS` in `wrangler.jsonc` in sync with `.env.local` — each
contract deploy creates a fresh instance.

## Local iteration

```bash
bun run cf:typecheck
bun run cf:dev                # then trigger a cron manually:
curl "http://localhost:8787/cdn-cgi/handler/scheduled?cron=*+*+*+*+*"
curl "http://localhost:8787/cdn-cgi/handler/scheduled?cron=*%2F5+*+*+*+*"
```
