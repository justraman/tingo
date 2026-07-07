# Tambola on Polkadot — Progress & Roadmap

On-chain Indian Bingo (Tambola) where a pallet-revive smart contract is the source of
truth: it holds the pot, validates tickets, draws numbers, awards line + full-house
prizes, and pays out. The frontend is a Vite + React SPA + shadcn product that runs inside a
Polkadot **Triangle host** and reaches the chain + host services (wallet, chat) through
**TrUAPI** (`@parity/product-sdk-host`); a bundled worker drives draws and chat.

> Full mental model: **[`ARCHITECTURE.md`](./ARCHITECTURE.md)**. Coding rules:
> **[`CLAUDE.md`](./CLAUDE.md)**.

- **Network:** `paseo-next-v2` (Polkadot Playground testnet) Asset Hub
- **Contract language:** Solidity → PolkaVM via `resolc` (Revive)
- **Host protocol:** [`paritytech/truapi`](https://github.com/paritytech/truapi) — the constrained host ↔ product API
- **Reference port:** [`justraman/tambola`](https://github.com/justraman/tambola) (Vue 2 + Firebase) → contract + React SPA
- **SDK reference:** [`paritytech/host-playground`](https://github.com/paritytech/host-playground)
- **Deploy tool:** [`paritytech/playground-cli`](https://github.com/paritytech/playground-cli)

Prize split: **top 15% · middle 15% · bottom 15% · full house 50% · host 5%**.
Unclaimed line shares roll into the full house. Only a full house ends the game.
If all 90 numbers draw with no full house → every ticket holder can refund.

---

## ✅ Done

### Smart contract (`contracts/`)
- `Tambola.sol` — full game logic: `createGame` (time→block prediction), `buyTicket`
  (on-chain 3×9 layout validation: 15 cells, 5/row, column ranges, strictly-increasing
  columns, no dupes, per-game hash dedup, ≤100 players), `drawNumber` (permissionless,
  gated by `startBlock` + `BLOCKS_BETWEEN_DRAWS`, `block.prevrandao`-based RNG over the
  un-drawn set), line/full-house payout with unclaimed-line rollover, `claimRefund`,
  **pull-payment ledger** (`withdrawable` + `withdraw()` with `nonReentrant`) to defuse
  the malicious-recipient DoS + reentrancy.
- `ITambola.sol` — extracted interface (types, events, external sigs, constants).
- `/// @custom:cdm @tambola/tambola` tag so CDM recognizes the package.
- Compiles to **PolkaVM** via `resolc 0.6.0` → `0x50564d…` ("PVM"), ~97.9 KB blob.

### Tests (`test/Tambola.t.sol`) — Foundry, **19/19 passing**
Create validation, every `buyTicket` rule + dedup, draw gating, single + multi-line
payout, full-house payout for each unclaimed-line combo (sum = 100%), withdraw, refund
pre-conditions, and a `ReentrantSink` reentrancy guard test.

### Frontend (`src/`) — Vite + React SPA + shadcn (migrated from Next.js 2026-07-07;
hosts only serve the root document, so routes are hash-based)
- Pages: `#/` (game list), `#/host/new` (schedule), `#/game/{id}` (live view — countdown,
  ticket generator/regenerator, buy, number board, winners, refund + withdraw, chat).
  Old path-form and legacy `/game?id=N` links redirect client-side into the hash route.
- Components: `TicketGrid`, `NumberBoard`, `Countdown`, `TicketGenerator`, `ChatPanel`,
  `WinnerBanner` + shadcn `ui/*`.
- Chain libs (`src/lib/chain/*`): host detection, PAPI client singleton (host provider
  vs `getWsProvider` standalone), `SignerManager`, `useAccounts`.
- Tambola libs (`src/lib/tambola/*`): ticket generator **ported from the reference repo**
  (`crypto.getRandomValues`), layout↔bitmap encoders, viem-encoded `ReviveApi.call`
  reads, `Revive.call` writes (+ `map_account` batch), event decode/subscribe, ABI.
- zustand stores: `wallet`, `game`, `draft` (persisted to `localStorage`), `chat`.
- **`bun run build` is green** (static export + Vite worker). Fixed SDK drift surfaced by
  the build: `use-accounts` maps `SignerAccount.getSigner()` and reads `state.error`
  (the `"error"` status was removed); `decodeEventLog` topics typed as a tuple in
  `events.ts` + worker; `tsconfig` `types` scoped to `node`/`react`/`react-dom` to skip
  a broken `@types/minimatch` stub.

### Worker (`worker/index.ts`) — Vite build to `./out/worker/`
Registers a Triangle chat room per `GameCreated`, posts system messages on
win/no-winner; subscribes to best block and pokes `drawNumber` once past `startBlock`
(permissionless — players can poke too if the worker is down).

### Tooling & deploy config
- **Foundry**: `foundry.toml` (`via_ir`, `out=forge-out`), `remappings.txt`, vendored
  `lib/forge-std`. `forge-polkadot` at `~/.foundry-polkadot/bin` (separate from vanilla).
- `resolc 0.6.0` verified + **seeded** into `~/.rvm/0.6.0/` so `--resolc`/CDM resolve it
  locally without the flaky 180 MB auto-download.
- `cdm.json`, `bulletin-deploy.config.ts` (app + worker, `chat: true`), npm scripts.
- `playground init` complete; dev signer `5DfhGyQdFobKM8NsWvEeAKk5EQQgYe9AydgJ7rMB6E1EqRzV`.

---

## 🟡 In progress — CDM registry/metadata publish

**The contract is deployed and verified live** at
`0xfea8d62be71219653740fd70fbf74fc0f3a2641b` (recorded in `.env.local`; smoke-tested —
`nextGameId` returns `0` through the app's own `ReviveApi.call` dry-run path). The
package `@tambola/tambola` is owned by the dev signer
(H160 `0x35cdb23ff7fc86e8dccd577ca309bfea9c978d20` = keccak(pubkey)[12..]) — deploys
**must** use `--signer dev`; the logged-in phone account gets an ownership error.

What's still failing is the **Bulletin metadata publish** step: the paseo-next-v2
Bulletin chain stalled (no blocks since 2026-07-06 15:11 UTC as of this writing), so
the publish tx times out after 300s. Not a code problem — retry when Bulletin produces
blocks again. **Each retry deploys a fresh contract instance** (a second one exists at
`0x363258b2bea4b1fb58c92af9c06ddd43c23ea93a`); after a successful retry, update
`.env.local` to whichever address the registry records.

```bash
playground contract deploy --signer dev     # --env was removed from `contract deploy` in CLI ≥0.34
```

---

## ⬜ To do

1. ~~**Reconcile the network constants**~~ — done. Genesis (#1), block time (#2), and
   `BLOCKS_BETWEEN_DRAWS` (#3) all reconciled and verified against the live chain.
2. ~~**Land the contract deploy**~~ — done; live + smoke-tested at
   `0xfea8d62be71219653740fd70fbf74fc0f3a2641b` (`.env.local`). Only the Bulletin
   metadata publish is pending (chain stalled — see In progress).
3. ~~**Generate PAPI descriptors**~~ — done (`.papi/` + `@polkadot-api/descriptors`
   wired into package.json; build green).
4. **Full create→buy→draw→win loop** with dev accounts against the live contract
   (reads already verified; writes fixed for PAPI v2 but not yet exercised on-chain).
5. ~~**Fix the worker signer**~~ — done; worker uses the shared `SignerManager`. Verify
   it signs correctly inside the host worker sandbox (To-do #7).
6. **Deploy frontend + worker** to Bulletin/IPFS+DotNS (`bun run build && playground
   deploy …`). Replace `public/icon.png.placeholder` with a real 256×256 PNG first.
7. **Verify in the Polkadot Desktop host** — host detection, wallet injection, chat room
   lifecycle (created on `GameCreated`, closed on `GameWon`/`GameEndedNoWinner`),
   `ReviveApi.call` reads with no direct-fetch.
8. ~~**Confirm SDK symbol names**~~ — done (2026-07-06). Upgraded to
   `product-sdk-signer 0.9.0` / `product-sdk-host 0.12.0` / `chain-client 0.7.7` and
   reconciled: `SignerManager` now uses a `HostProvider` with
   `productAccount: { dotNsIdentifier }` (products get app-scoped **product
   accounts**, not host wallet accounts — the 0.4.0 default yielded "No accounts
   available from host provider"); chat `sendMessage` payload is
   `{ tag: "Text", value: { text } }` and received actions carry `peer` +
   `payload.value.value.text`. Identifier derives from `window.location`
   (localhost dev) or falls back to `tambola-game.dot`.
9. **End-to-end on-chain test** — 2–3 dev accounts: line wins fire, full house ends +
   pays, balances move via `withdraw`, and the no-winner refund path.

---

## ⚠️ Known issues / notes

1. ~~**Genesis hash mismatch.**~~ **Resolved.** Live chain `chain_getBlockHash(0)`
   returns `0xbf0488dbe9daa1de1c08c5f743e26fdc2a4ecd74cf87dd1b4b1eeb99ae4ef19f` (the
   TrUAPI canonical value); `constants.ts` + `.env.example` updated. Re-verify if
   host-mode `getHostProvider` ever returns null (testnet genesis can change on reset).
2. ~~**Block time 2 vs 6.**~~ **Resolved.** `createGame` stores the wall-clock
   `startTimestamp` as `startTime` and gates `buyTicket`/`drawNumber` on
   `block.timestamp` — block-time prediction and `BLOCK_TIME_SECS` are gone. `Countdown`
   is wall-clock based; `blockTimeSec` removed from `constants.ts`.
3. ~~**`BLOCKS_BETWEEN_DRAWS` drift.**~~ **Resolved.** Worker now uses `5` to match the
   contract constant.
4. ~~**`getHostSigner` missing.**~~ **Resolved.** Worker signs via the shared
   `SignerManager` (`@parity/product-sdk-signer`); `account.getSigner()` yields the
   `PolkadotSigner`. Pending live-host verification.
5. **resolc binary is huge (180 MB)** and the sandbox network truncates it. Seeded at
   `~/.rvm/0.6.0/` (sha256-verified); recreate on a fresh machine.
6. **Two `forge` binaries:** vanilla (`~/.foundry/bin`, tests) and polkadot
   (`~/.foundry-polkadot/bin`, resolc/deploy). Put the right one first on `PATH`.
7. **Full-house payout leaves a few wei of dust** in the contract (integer division).
   Negligible on testnet; add a host `sweepDust(gameId)` if it matters.
8. **Cold-loading a finished game** shows the winner but not the payout amount (only in
   past events) — backfill via a historical event scan if desired.
9. **Ticket grid after refresh:** the layout lives in `localStorage` (draft store), so
   highlighting only works on the device that bought the ticket. On-chain tickets store
   bitmaps, not the grid — by design.
10. **RNG caveat:** `block.prevrandao` is influenceable by a participating block author.
    Testnet-acceptable; use commit-reveal / VRF for mainnet.
11. **PAPI v2 value shapes (fixed 2026-07-06).** With polkadot-api 2.x against this
    runtime's metadata, `H160`/`H256` values are **hex strings** (passing `Binary`
    throws `Incompatible runtime entry`), and `Bytes` results decode to `Uint8Array`
    (no `.asHex()`). `read.ts`, `write.ts`, `events.ts`, and the worker now use
    hex-string dests and `bytesToHex` on results/event data.
12. **Dry-run origin must be mapped.** The runtime rejects `ReviveApi.call` dry-runs
    from origins without a `Revive.map_account` mapping (`AccountUnmapped`, module
    error 0x2b). `READ_ONLY_ORIGIN` is now the dev deploy signer (mapped at deploy
    time). If the chain resets, re-deploying re-maps it.
13. **`is-mapped` check.** `write.ts` decides whether to batch `map_account` by querying
    `Revive.OriginalAccount(keccak(pubkey)[12..])` — `map_account` reverts for
    already-mapped accounts and would fail the whole `batch_all`.

---

## How to run (current state)

```bash
bun install

# contract tests (vanilla forge)
export PATH="$HOME/.foundry/bin:$PATH"
forge test -vv                                   # 19 passing

# compile to PolkaVM (polkadot forge + seeded resolc)
export PATH="$HOME/.foundry-polkadot/bin:$PATH"
forge build --resolc                             # → forge-out + target/cdm/foundry/Tambola.polkavm

# deploy contract (retry on transient network errors)
playground contract deploy --signer dev --env paseo-next-v2

# frontend dev server
bun run dev                                       # http://localhost:3000
```
