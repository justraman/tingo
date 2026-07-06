# Tambola on Polkadot — Progress & Roadmap

On-chain Indian Bingo (Tambola) where a pallet-revive smart contract is the source of
truth: it holds the pot, validates tickets, draws numbers, awards line + full-house
prizes, and pays out. The frontend is a Next.js + shadcn product that runs inside a
Polkadot **Triangle host** and reaches the chain + host services (wallet, chat) through
**TrUAPI** (`@parity/product-sdk-host`); a bundled worker drives draws and chat.

> Full mental model: **[`ARCHITECTURE.md`](./ARCHITECTURE.md)**. Coding rules:
> **[`CLAUDE.md`](./CLAUDE.md)**.

- **Network:** `paseo-next-v2` (Polkadot Playground testnet) Asset Hub
- **Contract language:** Solidity → PolkaVM via `resolc` (Revive)
- **Host protocol:** [`paritytech/truapi`](https://github.com/paritytech/truapi) — the constrained host ↔ product API
- **Reference port:** [`justraman/tambola`](https://github.com/justraman/tambola) (Vue 2 + Firebase) → contract + Next.js
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

### Frontend (`app/`, `src/`) — Next.js 15 + shadcn, static export
- Pages: `/` (game list), `/host/new` (schedule), `/game?id=N` (live view — countdown,
  ticket generator/regenerator, buy, number board, winners, refund + withdraw, chat).
  Query-string route (not `[id]`) because `output: 'export'` forbids dynamic segments.
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

## 🟡 In progress — contract deploy to paseo-next-v2

`playground contract deploy --signer dev` gets all the way through build (resolc
compiles, `@tambola/tambola` recognized) and fails only at the **registry submission
network call** (`Error: error sending request for url`) — the same transient
flaky-network class that plagued the resolc download, **not** a code/config problem. The
build and PVM artifact are valid.

**Next step:** retry the deploy, then capture the printed H160 into `.env.local` as
`NEXT_PUBLIC_TAMBOLA_ADDRESS`.

```bash
export PATH="$HOME/.foundry-polkadot/bin:$PATH"
playground contract deploy --signer dev --env paseo-next-v2     # retry until the registry call succeeds
```

---

## ⬜ To do

1. ~~**Reconcile the network constants**~~ — done. Genesis (#1), block time (#2), and
   `BLOCKS_BETWEEN_DRAWS` (#3) all reconciled and verified against the live chain.
2. **Land the contract deploy** — retry until the registry call goes through; record the
   H160 in `.env.local`.
3. **Generate PAPI descriptors** (`bun run papi:add`) for the typed `api.tx.Revive.*` /
   `api.query.*` paths (reads currently work via viem + `ReviveApi.call` without them).
4. **Wire the deployed address** and smoke-test reads (`getGame`, `nextGameId`) via the
   dev server, then a full create→buy→draw→win loop with dev accounts.
5. ~~**Fix the worker signer**~~ — done; worker uses the shared `SignerManager`. Verify
   it signs correctly inside the host worker sandbox (To-do #7).
6. **Deploy frontend + worker** to Bulletin/IPFS+DotNS (`bun run build && playground
   deploy …`). Replace `public/icon.png.placeholder` with a real 256×256 PNG first.
7. **Verify in the Polkadot Desktop host** — host detection, wallet injection, chat room
   lifecycle (created on `GameCreated`, closed on `GameWon`/`GameEndedNoWinner`),
   `ReviveApi.call` reads with no direct-fetch.
8. **Confirm SDK symbol names** against installed `@parity/product-sdk-*`
   (`getChatManager`, `getHostProvider`, `registerRoom` vs `createRoom`, `SignerManager`,
   `isInsideContainer*`); adjust imports where the live API differs.
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
