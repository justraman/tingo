# Tambola on Polkadot — Architecture & Understanding

This document is the single source of truth for *what this project is*, *how it is
wired*, and *why each piece exists*. README is the front door; PROGRESS is the
status log; CLAUDE.md is the working contract for code changes. This file is the
mental model behind all three.

---

## 1. One paragraph

Tambola (Indian Bingo / Housie) rebuilt so the **smart contract is the referee**.
A single Solidity contract on Polkadot Asset Hub (pallet-revive → PolkaVM) owns the
pot, validates every ticket against the structural rules of a Tambola grid, draws
numbers with on-chain randomness, awards line and full-house prizes, and pays out —
no backend, no trusted RNG server, no custodial wallet. The UI is a Next.js static
export that runs **inside a Polkadot host** (Desktop / Mobile / Web) as a sandboxed
"product" and talks to the chain and to host services (wallet signing, in-game chat,
the chain connection) through **TrUAPI**, the host's capability API. A worker bundled
with the app registers a chat room per game and pokes the permissionless `drawNumber`
forward every few blocks.

---

## 2. The Triangle host model and TrUAPI (the "constraint API")

### 2.1 What a "Triangle product" is

A **product** is a web app that does not run as a normal tab. It runs *embedded* —
inside an iframe or native webview — within a **host**: Polkadot Desktop Browser,
Polkadot Mobile, or a web host. The host is the trusted shell that holds the user's
keys and the chain connections. The product is untrusted sandboxed code. The two
share **no memory**; every interaction crosses a process boundary as bytes.

Because the product is sandboxed, it **cannot** do what a normal web page does:

- No direct outbound `fetch`/HTTP. (Plain WebSocket to a chain RPC is the one path
  allowed in both host and standalone modes — which is why our chain reads use a WS
  PAPI client, never a viem `PublicClient`.)
- No access to private keys. Signing is delegated to the host.
- No ambient capabilities. Camera, clipboard, chain-broadcast, statement submission,
  etc. are all **permission-gated** by the host.

This sandbox-plus-delegation shape is the "constraint" the user referred to: the host
exposes a *constrained*, permissioned API surface, and the product is confined to it.

### 2.2 TrUAPI — the protocol

**TrUAPI** = *Triangle User-Agent Programming Interface*. It is the protocol a product
uses to talk to its host. Reference docs: <https://paritytech.github.io/truapi/>;
source: `github.com/paritytech/truapi`.

- **One Rust crate (`truapi`) is the contract.** It defines every method, request /
  response type, error enum, and an append-only wire discriminant per method
  (`#[wire(...)]`). A code generator emits a typed TypeScript client from it, so the
  method signatures and the wire format can never drift.
- **Transport** (`docs/design/truapi-protocol.md`): an opaque byte channel
  (`MessagePort` / `postMessage`). Bodies are **SCALE-encoded** — positional, so field
  and enum-variant *order* is part of the wire contract. Messages are framed as
  `Message { requestId, payload }`; payloads are versioned (`Versioned::V1` = 0).
- **Two call shapes.** A plain call → `*_request` / `*_response` pair sharing a
  `requestId`. A subscription → `*_start` / `*_stop` / `*_interrupt` / `*_receive`
  lifecycle, also sharing a `requestId`.
- **Handshake first.** Both sides negotiate the codec version (SCALE = `1`) before any
  payload is trusted; any other request before a successful handshake fails.
- **Language-agnostic.** Nothing Rust-specific is assumed; any platform that produces
  the same byte layout can speak it (this is how Desktop/iOS/Android hosts interop).

### 2.3 The namespaces (capabilities)

The unified `TrUApi` trait (`rust/crates/truapi/src/api/mod.rs`) is the sum of these
capability traits. Methods quoted below are exact names from the source.

| Namespace            | Representative methods (calls / subscriptions)                                              | Purpose for a product like ours |
|----------------------|---------------------------------------------------------------------------------------------|---------------------------------|
| `System`             | `handshake`, `featureSupported`, `navigateTo`                                                | Negotiate, feature-detect, deep-link |
| `Chain`              | `followHeadSubscribe`, `getHeadHeader`, …                                                    | The host-routed chain connection (PAPI provider) |
| `Signing`            | `createTransaction` (product account), `createTransactionWithLegacyAccount`                  | Build a signed extrinsic without ever seeing the key |
| `Account`            | `getAccount`, `getAccountAlias`, `connectionStatusSubscribe`                                 | App-scoped (product) accounts + Ring-VRF aliases |
| `Chat`               | `createRoom`, `registerBot`, `listSubscribe`, post-message, subscribe-action                 | Not implemented by hosts yet — we chat over `StatementStore` instead |
| `Permissions`        | `requestDevicePermission`, `requestRemotePermission`                                         | Ask once; persisted thereafter |
| `ResourceAllocation` | request resource allowances                                                                  | Pre-grant e.g. Bulletin / statement allowances |
| `StatementStore`     | subscribe / createProof / submit                                                             | Ephemeral on-chain messaging |
| `Preimage`           | submit / lookup                                                                              | Bulletin-chain blob storage |
| `Payment`            | balance / topUp / requestPayment (RFC-0006)                                                  | User-initiated payments |
| `CoinPayment`        | merchant checkout (RFC-0017)                                                                 | Merchant-initiated payments |
| `Notifications`      | `sendPushNotification`, `cancelPushNotification` (RFC-0019)                                  | Local + scheduled push |
| `Entropy`            | `derive` (RFC-0007)                                                                          | Deterministic per-wallet entropy |
| `LocalStorage`       | read / write / clear (+ raw bytes)                                                           | Host-backed persistent storage |
| `Theme`              | `subscribeTheme`                                                                             | Light/Dark sync with the host |

**Errors / the permission gate.** Every method returns a framework `CallError<D>`:
`Domain(D)`, `Denied`, `Unsupported`, `MalformedFrame`, `HostFailure`. `Denied` is the
constraint mechanism. Per RFC-0002, "business" methods (signing, chain broadcast,
statement/preimage submit) **implicitly trigger a permission prompt** the first time;
the user approves once and the grant is persisted, after which calls resolve without a
prompt. Device permissions (`Camera`, `Clipboard`, `OpenUrl`, …) and remote
permissions (HTTP/WS domains, chain broadcast, …) are the two permission families.

### 2.4 How *we* reach TrUAPI: `@parity/product-sdk-host`

We do **not** call the raw protocol. We depend on `@parity/product-sdk-host` (v0.5.0),
which wraps the host implementation (`@novasamatech/host-api` /
`@novasamatech/host-api-wrapper`) and exposes ergonomic getters. The ones this app
uses or could use:

- `isInsideContainer()` / `isInsideContainerSync()` — host detection.
- `getHostProvider(genesisHash)` — a PAPI `JsonRpcProvider` routed through the host's
  shared chain connection. **This is the `Chain` namespace in practice.**
- `getChatManager()` — **unused**: hosts don't implement `Chat` yet. In-game chat
  rides the statement store via `@parity/product-sdk-statement-store`
  (`StatementStoreClient`, host mode) — topic1 = app name, topic2 = `tambola-<id>`
  (see `src/lib/chat/protocol.ts`).
- `getAccountsProvider()` — host wallet accounts, product accounts, Ring-VRF, login.
- `getTruApi()` — the low-level escape hatch (`navigateTo`, `permission`,
  `deriveEntropy`, `themeSubscribe`, `signing.createTransaction`, …) when no
  high-level getter exists.
- `requestPermission()`, `requestDevicePermission()`, `requestResourceAllocation()`,
  `deriveEntropy()`, `getStatementStore()`, `getPreimageManager()`,
  `getPaymentManager()`, `getThemeProvider()`, `getHostLocalStorage()`.

> **Naming note.** `@parity/product-sdk-host` is the *successor packaging* of the same
> host protocol that TrUAPI formalizes. The truapi repo is the canonical method/type
> reference; product-sdk-host is the client we actually import. Treat them as two views
> of one surface. Where the worker imports `getHostSigner` (see §9) that symbol is
> **not** in the installed SDK — signing must go through `getAccountsProvider` /
> `getTruApi().signing` / `@parity/product-sdk-signer` instead.

---

## 3. System shape

```
┌──────────────────────── Polkadot Host (Desktop / Mobile / Web) ───────────────────────┐
│  Holds keys · owns chain connections · enforces permissions (the "constraint" layer)   │
│                                                                                         │
│   TrUAPI  (SCALE over MessagePort)                                                      │
│     ▲  getHostProvider / statement store / signing / accounts / permissions ...        │
│     │                                                                                   │
│  ┌──┴───────────────── Product sandbox (our code) ─────────────────────────────────┐   │
│  │                                                                                   │   │
│  │   Next.js static export (app/, src/)            Worker (worker/index.ts)          │   │
│  │   ─ game list / schedule / live view            ─ chat announcements per game    │   │
│  │   ─ reads via ReviveApi.call (dry-run)          ─ pokes drawNumber every N blocks│   │
│  │   ─ writes via Revive.call extrinsic            ─ subscribes best block          │   │
│  │   ─ events via Revive.ContractEmitted           ─ posts system chat messages     │   │
│  │   ─ zustand stores (wallet/draft/game/chat)                                       │   │
│  └───────────────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────────────┘
                                        │  PAPI (WebSocket JSON-RPC)
                                        ▼
                 ┌──────────────────────────────────────────────────┐
                 │   Asset Hub (paseo-next-v2)  ·  pallet-revive      │
                 │   Tambola.sol (PolkaVM)  — owns pot, rules, RNG    │
                 └──────────────────────────────────────────────────┘
```

Two runtime modes, one codebase:

- **Host mode** (the real target): provider from `getHostProvider`, chat available,
  signing via host wallet. Direct HTTP forbidden.
- **Standalone mode** (`next dev` in a normal tab): provider from `getWsProvider`,
  no chat, signer from a browser wallet. Used for local UI iteration only.

The host-vs-standalone split is centralized in `src/lib/chain/client.ts` and
`src/lib/host/detect.ts`; the rest of the app is mode-agnostic.

---

## 4. The smart contract (`contracts/`)

`Tambola.sol` implements `ITambola.sol`. The interface holds every public type, event,
external signature, and constant; the frontend ABI derives from it. One contract hosts
**many concurrent games** keyed by `gameId` (1-based, `++nextGameId`).

### 4.1 State per game

`Game` packs: `host`, `ticketPrice`, `startTime` (unix seconds), `lastDrawBlock`, `maxTickets`,
`ticketCount`, a 90-bit `polledMask` of drawn numbers, the `pot`, a `GameState`
(`Pending → Live → Won | NoWinner`), the four winner addresses, the ordered
`drawnOrder[]`, and `tickets[]`. Side mappings: per-game layout-hash dedup
(`_ticketHashSeen`), per-player ticket ids (`_playerTicketIds`, a player may hold
several), refund tracking (`_refundClaimed`), and the global pull-payment ledger
`withdrawable`.

A `Ticket` stores only **bitmaps** (`fullhouseMask`, `topRowMask`, `middleRowMask`,
`bottomRowMask`) plus the layout `hash` — never the row/col grid. Win-checking is then
a pure bitmask AND. Since a number's value fixes its column, the UI reconstructs any
ticket's 3×9 grid from the row masks (`gridFromMasks` in `encode.ts`).

### 4.2 Lifecycle

1. **`createGame(startTimestamp, ticketPrice)`** — host schedules a game. Stores the
   wall-clock `startTimestamp` (unix seconds) directly as `startTime` and gates on
   `block.timestamp`, so no block-time estimate is needed. Emits `GameCreated`.
2. **`buyTicket(gameId, uint8[27] layout)`** `payable` — must send exactly
   `ticketPrice`, before `startTime`, ≤100 tickets per game; a player may buy any
   number of tickets while capacity lasts (each layout unique). The grid
   is validated **in one pass** (`_validateAndMask`): 15 filled cells, exactly 5 per
   row, 1–3 per column, each value inside its column range
   (`col 0 → 1..9`, `col c → c·10..c·10+9`, `col 8 → 80..90`), strictly increasing
   down a column, no duplicate numbers; then deduped by `keccak256(layout)`. Emits
   `TicketBought`.
3. **`drawNumber(gameId)`** — **permissionless**. Anyone (the worker, or any player)
   can call once `block.timestamp ≥ startTime` and `block.number ≥ lastDrawBlock +
   BLOCKS_BETWEEN_DRAWS`. Picks an undrawn number via `_nextNumber`, sets the mask,
   appends to history, emits `NumberDrawn`, then `_checkWinners`. If all 90 numbers are
   drawn with no full house → `NoWinner` + `GameEndedNoWinner`.
4. **`claimRefund(gameId)`** — only in `NoWinner`. Each ticket holder claims an equal
   share of the pot net of any line prizes already paid; credits the ledger.
5. **`withdraw()`** — pull-payment: zeroes the caller's `withdrawable` then transfers,
   under `nonReentrant` + checks-effects-interactions. Emits `Withdrawn`.

### 4.3 Prize math (basis points of the pot)

`LINE_BPS = 1500` ×3, `FULLHOUSE_BPS = 5000`, `HOST_BPS = 500`. Each line pays the
**first** ticket to complete it. The game ends **only** on a full house; at that point
the full-house winner receives `FULLHOUSE_BPS + LINE_BPS × (unclaimed lines)` — i.e.
**unclaimed line shares roll into the full house** — and the host gets `HOST_BPS`. Sums
to 100% in every combination (covered by tests). Integer division leaves a few wei of
dust in the contract (negligible; a `sweepDust` could be added).

### 4.4 Randomness

`_nextNumber` hashes `block.prevrandao`, `block.timestamp`, the previous blockhash,
`msg.sender`, `polledMask`, and the draw count, then indexes into the remaining set.
This is **consensus randomness, not a VRF** — adequate for a testnet game but
influenceable by a block author who is also playing. Documented tradeoff; a
commit-reveal or VRF would harden it for mainnet.

### 4.5 Tests

`test/Tambola.t.sol` (Foundry, 19 cases): create validation; every `buyTicket` rule +
dedup; draw gating; single- and multi-line payout; full-house payout for each
unclaimed-line combination (each summing to 100%); withdraw; refund preconditions; and
a `ReentrantSink` guard test.

---

## 5. Build & deploy pipeline

- **Compile:** Foundry (`foundry.toml`: `via_ir`, `out = forge-out` to avoid clobbering
  Next's `./out`, solc 0.8.24, cancun). Two `forge` binaries are in play: vanilla
  `~/.foundry/bin/forge` for tests, and `~/.foundry-polkadot/bin/forge --resolc` for
  PolkaVM. `resolc 0.6.0` lowers EVM bytecode to a `0x50564d…` ("PVM") blob (~98 KB at
  `target/cdm/foundry/Tambola.polkavm`).
- **CDM:** `cdm.json` + the `/// @custom:cdm @tambola/tambola` tag let the Contract
  Deployment Manager recognize the package.
- **Deploy contract:** `playground contract deploy --signer dev --env paseo-next-v2`
  → prints an H160; write it into `.env.local` as `NEXT_PUBLIC_TAMBOLA_ADDRESS`.
- **Deploy app + worker:** `playground deploy` reads `bulletin-deploy.config.ts` (two
  executables: the static `./out` app, and the Vite-built worker at `./out/worker` with
  `includes.chat: true`), uploads to the **Bulletin Chain / IPFS**, and registers a
  **DotNS** domain (`tambola-game.dot`). Replace `public/icon.png.placeholder` with a
  real 256×256 PNG first.

---

## 6. The frontend (`app/`, `src/`)

Next.js 15 App Router, **`output: "export"`** (fully static — required for IPFS / host
delivery), `trailingSlash`, unoptimized images, React 19, Tailwind + shadcn, dark by
default. The live game lives at **`/game/{id}`** — a dynamic segment pre-rendered via
`generateStaticParams` for the first `MAX_PRERENDERED_GAMES` sequential ids (static
export can't materialize unbounded params and IPFS/DotNS gateways can't do SPA
rewrites). Legacy `/game?id=N` links redirect client-side.

### 6.1 Chain layer (`src/lib/chain/`)

- `constants.ts` — `CHAIN` (name, genesis, rpc, decimals, symbol, blockTime),
  `TAMBOLA_ADDRESS`, and `READ_ONLY_ORIGIN` (an SS58 used as the dry-run caller).
- `client.ts` — the PAPI client singleton, host vs standalone provider selection.
- `signer.ts` — a single `SignerManager` from `@parity/product-sdk-signer`
  (`dappName: "tambola"`) + `ensureSignerConnected()`.
- `use-accounts.ts` — React hook subscribing to the signer manager; yields
  `{ accounts, isReady, connect }`. Each account carries a polkadot-api `PolkadotSigner`.

### 6.2 Contract I/O (`src/lib/tambola/`)

The contract is Solidity-on-PolkaVM, so all I/O is **viem ABI encode/decode wrapped in
pallet-revive calls** over PAPI's unsafe API:

- `read.ts` — `encodeFunctionData` (viem) → `ReviveApi.call(origin, dest, 0, …, data)`
  **dry-run** → `decodeFunctionResult` (viem). Host-safe (no `PublicClient`, which would
  need forbidden direct HTTP). Typed wrappers: `readGame`, `readDrawnNumbers`,
  `readTicketByOwner`, `readNextGameId`, `readWithdrawable`, etc.
- `write.ts` — `Revive.call` extrinsic with a dry-run-estimated weight (×4 headroom)
  and storage-deposit limit; if the account isn't mapped yet, wraps it in
  `Utility.batch_all([Revive.map_account, Revive.call])`. `watchTransaction` adapts the
  PAPI observable to a `Promise<txHash>` with `onStatus` callbacks. Entry points:
  `callCreateGame`, `callBuyTicket`, `callDrawNumber`, `callClaimRefund`, `callWithdraw`.
- `events.ts` — watches `Revive.ContractEmitted`, filters by our address, decodes with
  viem `decodeEventLog`. Strongly-typed `TambolaEvent` union.
- `encode.ts` — grid ⇆ `uint8[27]` row-major converters and `bitmasksFromLayout`
  mirroring the contract's bit layout (bit `i` ↔ number `i+1`).
- `ticket.ts` — the ticket generator ported from `justraman/tambola`
  (`Ticket`/`TicketNode`), with three deliberate changes: crypto RNG, restart on the
  reference's placement dead-end (it can spin forever), and a max-run-of-2 rule (no
  row carries 3+ adjacent numbers). `validateTicket` mirrors the contract's rules
  for friendly pre-submit UX.
- `abi.ts` — the ABI + `GameView`/`TicketView` TS types.

### 6.3 State (`src/lib/store/`, zustand)

- `wallet` — selected address.
- `draft` — **persisted to `localStorage`** (`tambola-drafts`): the not-yet-purchased
  draft (grid + encoded layout) per game. Bought tickets are read from chain and their
  grids reconstructed from the row masks, so they render on any device.
- `game` — live snapshot per id (game scalars, drawn numbers, line winners, final
  winner, no-winner flag) + global `bestBlock`.
- `chat` — messages + closed flag per game.

### 6.4 Screens (`app/`)

- `/` (`page.tsx`) — lists games (`readNextGameId` then iterates `readGame`); shows the
  "open in Polkadot Desktop" card in standalone mode.
- `/host/new` — schedule form (start datetime + ticket price) → `callCreateGame`.
- `/game/{id}` — the live view: countdown, ticket generator/buy, number board, winner
  banner, your-ticket grid, refund + withdraw, and the chat panel. Wires three
  subscriptions (best block, contract events scoped to this game, chat) and refreshes
  reads on each event.

Components (`src/components/`): `TicketGrid`, `NumberBoard`, `Countdown`,
`TicketGenerator`, `ChatPanel`, `WinnerBanner`, plus shadcn `ui/*`.

---

## 7. The worker (`worker/index.ts`)

A separate executable, Vite-built to `./out/worker`, running in the host's worker
sandbox (`includes.chat: true`). It is a **convenience, not a trust anchor** — the draw
is permissionless, so a stalled worker never bricks a game. Two jobs:

1. **Chat announcements.** On `GameCreated`, publish a welcome statement to the
   `tambola-<id>` room (statement-store topic2); on `GameWon` /
   `GameEndedNoWinner`, publish a closing message.
2. **Draw poker.** Subscribes `bestBlocks$`; for each active game past `startBlock` and
   `lastDrawBlock + N`, dry-runs and submits `drawNumber`, guarded by a `pendingTx`
   flag so it never double-fires while a tx is in flight.

It uses `StatementStoreClient` (host mode), `getHostProvider`, and (see §9) a host
signer.

---

## 8. End-to-end flow

```
Host schedules     → callCreateGame → Revive.call createGame → GameCreated
                                                              → worker announces game in chat
Player generates   → ticket.ts (crypto RNG) → draft store (localStorage)
Player buys        → callBuyTicket(value=price) → buyTicket validates+stores bitmaps → TicketBought
Start block passes → worker/players call drawNumber every N blocks → NumberDrawn (×up to 90)
                       _checkWinners → LineWon (first to complete each row)
Full house hit     → GameWon (fullhouse + unclaimed lines, + host fee) → state Won → chat closes
   or 90 drawn      → GameEndedNoWinner → players claimRefund
Anyone with a credit→ callWithdraw → transfer from pull-payment ledger → Withdrawn
```

---

## 9. Known gaps & discrepancies (verify before relying on them)

These surfaced while reading the code against the canonical TrUAPI source. They are
recorded so they are not rediscovered later.

1. ~~**Genesis hash mismatch.**~~ **Resolved.** Verified the live chain
   (`chain_getBlockHash(0)` on `wss://paseo-asset-hub-next-rpc.polkadot.io`) returns
   `0xbf0488dbe9daa1de1c08c5f743e26fdc2a4ecd74cf87dd1b4b1eeb99ae4ef19f` — the TrUAPI
   canonical value. `constants.ts` + `.env.example` updated to match. (Testnet genesis
   can change on reset; re-verify if host-mode `getHostProvider` ever returns null.)
2. ~~**Block time: 2 vs 6.**~~ **Resolved.** `createGame` now stores the wall-clock
   `startTimestamp` directly as `startTime` and gates `buyTicket`/`drawNumber` on
   `block.timestamp`, so block-time prediction (and the `BLOCK_TIME_SECS` constant) is
   gone. The `Countdown` is wall-clock based; `blockTimeSec` was dropped from
   `constants.ts`.
3. ~~**`BLOCKS_BETWEEN_DRAWS` drift.**~~ **Resolved.** Worker aligned to the contract
   constant `5`. (Still a hardcoded copy — read it on-chain when descriptors land.)
4. ~~**`getHostSigner` does not exist**~~ **Resolved.** The worker now signs via the
   shared `SignerManager` (`@parity/product-sdk-signer`) from `src/lib/chain/signer.ts`
   — `account.getSigner()` yields the `PolkadotSigner`. Needs live-host verification (§9.7).
5. ~~**Not yet deployed.**~~ **Resolved (2026-07-06).** Live at
   `0xfea8d62be71219653740fd70fbf74fc0f3a2641b` (`.env.local`), descriptors generated
   (`.papi/`). Two runtime gotchas surfaced and fixed: PAPI v2 wants `H160` values as
   hex strings (not `Binary`) and returns `Bytes` as `Uint8Array`; and dry-run origins
   must be `map_account`-mapped (`READ_ONLY_ORIGIN` is now the mapped dev signer).
   Bulletin metadata publish still pending (chain stalled) — see PROGRESS.md.
6. **Cold-load payout amount.** A finished game shows the winner but not the payout
   amount on first load (amounts live in past events); backfill via a historical scan.
7. **RNG caveat.** `block.prevrandao` is influenceable by a participating block author
   (see §4.4). Testnet-acceptable; harden for mainnet.

---

## 10. Glossary

- **Triangle / host** — the native Polkadot shell (Desktop/Mobile/Web) that embeds and
  constrains products.
- **Product** — a sandboxed web app running inside a host (this app).
- **TrUAPI** — Triangle User-Agent Programming Interface; the SCALE-over-IPC protocol
  between product and host. Consumed here via `@parity/product-sdk-host`.
- **pallet-revive / PolkaVM** — the Substrate pallet + VM that runs Solidity (lowered by
  `resolc`) on Asset Hub. `Revive.call` / `ReviveApi.call` are its extrinsic / runtime
  API.
- **PAPI** — `polkadot-api`, the typed JSON-RPC client used for all chain interaction.
- **Bulletin Chain / DotNS** — content-addressed storage + naming used to deploy the
  static app and worker.
- **Pull payment** — winners' funds are credited to a ledger and withdrawn on demand,
  so one malicious recipient cannot freeze the game.
