# Tambola on Polkadot — Progress & Roadmap

On-chain Indian Bingo (Tambola) where a pallet-revive smart contract is the
source of truth: it holds the pot, validates tickets, draws numbers, awards
line + full-house prizes, and pays out. Frontend is a Next.js + shadcn dApp for
the Polkadot Triangle host, with an in-game chat and a worker that drives draws.

- **Network:** `paseo-next-v2` (Polkadot Playground testnet) Asset Hub
- **Contract language:** Solidity → PolkaVM via `resolc` (Revive)
- **Reference port:** [`justraman/tambola`](https://github.com/justraman/tambola) (Vue 2 + Firebase) → contract + Next.js
- **SDK reference:** [`paritytech/host-playground`](https://github.com/paritytech/host-playground)
- **Deploy tool:** [`paritytech/playground-cli`](https://github.com/paritytech/playground-cli)

Prize split: **top 15% · middle 15% · bottom 15% · full house 50% · host 5%**.
Unclaimed line shares roll into the full house. Only a full house ends the game.
If all 90 numbers draw with no full house → every ticket holder can refund.

---

## ✅ Done

### Smart contract (`contracts/`)
- `Tambola.sol` — full game logic: `createGame` (time→block prediction at 2s/block),
  `buyTicket` (on-chain 3×9 layout validation: 15 cells, 5/row, column ranges,
  strictly-increasing columns, no dupes, per-game hash dedup, ≤100 players),
  `drawNumber` (permissionless, gated by `startBlock` + `BLOCKS_BETWEEN_DRAWS`,
  `block.prevrandao`-based RNG over the un-drawn set), line/full-house payout with
  unclaimed-line rollover, `claimRefund`, **pull-payment ledger** (`withdrawable` +
  `withdraw()` with `nonReentrant`) to defuse the malicious-recipient DoS + reentrancy.
- `ITambola.sol` — extracted interface (types, events, external sigs, constants);
  `Tambola is ITambola`.
- `/// @custom:cdm @tambola/tambola` tag so CDM recognizes the package.
- Compiles to **PolkaVM** via `resolc 0.6.0` → `0x50564d…` ("PVM"), ~97.9 KB blob
  (`target/cdm/foundry/Tambola.polkavm`).

### Tests (`test/Tambola.t.sol`) — Foundry, **19/19 passing**
Covers create validation, every `buyTicket` rule + dedup, draw gating, single +
multi-line payout, full-house payout for each unclaimed-line combo (sum = 100%),
withdraw, refund pre-conditions, and a `ReentrantSink` reentrancy guard test.

### Frontend (`app/`, `src/`) — Next.js 15 + shadcn, dev server renders 200
- Pages: `/` (game list), `/host/new` (schedule), `/game?id=N` (live view — countdown,
  ticket generator/regenerator, buy, number board, winners, refund + withdraw, chat).
  (Query-string route, not `[id]`, because `output: 'export'` forbids dynamic segments.)
- Components: `TicketGrid`, `NumberBoard`, `Countdown`, `TicketGenerator`, `ChatPanel`,
  `WinnerBanner` + shadcn `ui/*`.
- Chain libs (`src/lib/chain/*`): host detection, PAPI client singleton (host provider
  vs `getWsProvider` standalone), `SignerManager`, `useAccounts`.
- Tambola libs (`src/lib/tambola/*`): ticket generator **ported from the reference repo**
  (`crypto.getRandomValues`), layout↔bitmap encoders, viem-encoded `ReviveApi.call`
  reads, `Revive.call` writes (+ `map_account` batch), event decode/subscribe, ABI.
- zustand stores: `wallet`, `game`, `draft` (persisted to `localStorage`), `chat`.

### Worker (`worker/index.ts`) — Vite build to `./out/worker/`
Registers a Triangle chat room per `GameCreated`, posts system messages on
win/no-winner; subscribes to best block and pokes `drawNumber` every 4 blocks once
past `startBlock` (permissionless — players can poke too if the worker is down).

### Tooling & deploy config
- **Foundry** (replaced Hardhat): `foundry.toml` (`via_ir`, `out=forge-out`),
  `remappings.txt`, vendored `lib/forge-std`. `forge-polkadot` installed at
  `~/.foundry-polkadot/bin` (separate from vanilla `~/.foundry`).
- `resolc 0.6.0` verified (sha256 match) and **seeded into rvm cache**
  `~/.rvm/0.6.0/` + `.default_version`, so `forge build --resolc` and CDM resolve
  it locally without the (flaky) 180 MB auto-download.
- `cdm.json`, `bulletin-deploy.config.ts` (app + worker, `chat: true`), npm scripts
  (`test:contract`, `compile:contract`, `deploy:contract`, `deploy:app`).
- `playground init` complete; logged-in dev signer
  `5DfhGyQdFobKM8NsWvEeAKk5EQQgYe9AydgJ7rMB6E1EqRzV`.

---

## 🟡 In progress — contract deploy to paseo-next-v2

`playground contract deploy --signer dev` now gets **all the way through build**
(resolc compiles, `@tambola/tambola` package recognized) and only fails at the
**registry submission network call**:

```
@tambola/tambola   ████████████   ✕
Error: error sending request for url
```

This is the same flaky-network class of error that plagued the resolc download —
a transient failure talking to the paseo-next-v2 registry/RPC, **not** a code or
config problem. The build and PVM artifact are valid.

**Next step:** simply retry the deploy (network permitting), then capture the
printed H160 address into `.env.local` as `NEXT_PUBLIC_TAMBOLA_ADDRESS`.

```bash
export PATH="$HOME/.foundry-polkadot/bin:$PATH"
playground contract deploy --signer dev          # retry until the registry call succeeds
```

---

## ⬜ To do

1. **Land the contract deploy** — retry until the registry call goes through; record
   the H160 address in `.env.local`.
2. **Generate PAPI descriptors** for the frontend reads/writes:
   `npx papi add paseo_asset_hub -w wss://paseo-asset-hub-next-rpc.polkadot.io`.
   (Removed the stale `@polkadot-api/descriptors` file dep; the app currently leans on
   viem ABI encode + `ReviveApi.call`, but generated descriptors are still needed for
   the typed `api.tx.Revive.*` / `api.query.*` paths.)
3. **Wire the deployed address** and smoke-test reads (`getGame`, `nextGameId`) via the
   dev server, then a full create→buy→draw→win loop with dev accounts.
4. **Deploy frontend + worker** to Bulletin/IPFS+DotNS:
   `npm run build && playground deploy --signer dev --domain tambola-game --buildDir ./out --env paseo-next-v2 --playground`.
   Replace `public/icon.png.placeholder` with a real 256×256 PNG first.
5. **Verify in the Polkadot Desktop host** — host detection, wallet injection, chat room
   lifecycle (created on `GameCreated`, frozen on `GameWon`/`GameEndedNoWinner`),
   `ReviveApi.call` reads with no direct-fetch (host would 403).
6. **Confirm SDK symbol names** against the installed `@parity/product-sdk-*` versions
   (`getChatManager`, `getHostProvider`, `getHostSigner`, `SignerManager`,
   `isInsideContainer*`) — a reviewer flagged these may differ from the live API; adjust
   imports if so.
7. **End-to-end on-chain test** — full game with 2–3 dev accounts: line wins fire, full
   house ends + pays, balances move via `withdraw`, and the no-winner refund path.

---

## ⚠️ Known issues / notes

- **resolc binary is huge (180 MB) and the sandbox network truncates it.** It's now
  seeded at `~/.rvm/0.6.0/` (sha256-verified). If rebuilding on a fresh machine, that
  seed must be recreated or the auto-download allowed to complete.
- **Two `forge` binaries:** vanilla `~/.foundry/bin/forge` (tests) and polkadot
  `~/.foundry-polkadot/bin/forge` (resolc/deploy). Put the polkadot one first on `PATH`
  for any `--resolc`/deploy work.
- **Full-house payout leaves a few wei of integer-division dust** in the contract.
  Negligible on testnet; add a host `sweepDust(gameId)` if it matters.
- **Cold-loading a finished game** shows the winner but not the payout amount (only in
  past events) — backfill via a historical event scan if desired.
- **Ticket grid after refresh:** the layout lives in `localStorage` (draft store), so
  highlighting only works on the device that bought the ticket. The on-chain ticket
  stores only bitmaps (not the row/col layout), by design.

---

## How to run (current state)

```bash
# install deps
bun install

# contract tests (vanilla forge)
export PATH="$HOME/.foundry/bin:$PATH"
forge test -vv                                   # 19 passing

# compile to PolkaVM (polkadot forge + seeded resolc)
export PATH="$HOME/.foundry-polkadot/bin:$PATH"
forge build --resolc                             # → forge-out + target/cdm/foundry/Tambola.polkavm

# deploy contract (retry on transient network errors)
playground contract deploy --signer dev

# frontend dev server
bun run dev                                       # http://localhost:3000
```
