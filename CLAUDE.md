# CLAUDE.md

Working contract for this repo. Read `ARCHITECTURE.md` once for the full mental model;
this file is the day-to-day rules. Keep it short and true.

## What this is

On-chain Tambola (Indian Bingo). A Solidity contract on Asset Hub (pallet-revive →
PolkaVM) is the referee — it owns the pot, validates tickets, draws numbers, and pays
out. The UI is a static Vite + React SPA "product" that runs inside a Polkadot host
(Desktop / Mobile / Web) and reaches the chain + host services through **TrUAPI** via
`@parity/product-sdk-host`. A bundled worker drives draws and chat.

## How to write code here

Write it the way a senior engineer ships production code: the reader should understand
it without prose.

- **No narrating comments.** Don't restate what the code does. `// loop over tickets`
  above a `for` loop is noise. Delete it. The existing files carry large header
  comments — when you touch a file, prefer trimming them to maintaining them; do not
  add new ones in that style.
- **Comments earn their place only for a non-obvious _why_** that the code cannot show:
  a protocol constraint (SCALE field order is the wire contract), a security invariant
  (checks-effects-interactions in `withdraw`), a known caveat (`prevrandao` RNG is
  influenceable). One line, stating the reason, never the mechanism.
- **Names do the documenting.** `bitmasksFromLayout`, `READ_ONLY_ORIGIN`,
  `ensureSignerConnected` — a good name removes the need for a comment. Rename before
  you annotate.
- **Small, single-purpose modules.** One concern per file, matching the existing
  `src/lib/{chain,tambola,store,host,chat}` split. Pure logic (ticket gen, encoding,
  prize math) stays free of I/O and React.
- **Types are load-bearing.** No `any` in new code except at the unavoidable PAPI
  unsafe-API boundary, and isolate that cast in the lib layer, never in a component.
  Model domain unions explicitly (see `TambolaEvent`, `GameState`).
- **Functions are small and total.** Validate inputs at the edge, return early, make
  illegal states unrepresentable. Errors are thrown with a specific message or returned
  as a typed result — never swallowed silently except where "not one of ours" is the
  literal intent (event decode filter).
- **No premature abstraction.** Match the patterns already here; don't introduce a
  framework, a DI container, or a clever generic for a two-call-site need.

## Architectural rules (do not break these)

1. **The contract is the source of truth.** Any rule change in `Tambola.sol` must be
   mirrored in lockstep: `ITambola.sol` (interface), `src/lib/tambola/encode.ts`
   (bitmaps), `ticket.ts` `validateTicket`, `events.ts` (`TambolaEvent`), `abi.ts`
   types, and the Foundry tests. The frontend never invents validation the chain
   doesn't enforce.
2. **On-chain stores bitmaps, not grids.** Tickets persist `*Mask` + `hash` only. But
   a number's value fixes its column, so the 3×9 grid is fully reconstructable from
   the three row masks — display goes through `gridFromMasks` (`encode.ts`). The
   `draft` store (localStorage) holds only the not-yet-purchased draft.
3. **`drawNumber` stays permissionless.** It is the liveness guarantee — anyone can
   poke it. Never gate it behind the host or an owner.
4. **Money is pull, not push.** All payouts credit `withdrawable`; recipients
   `withdraw()`. Keep checks-effects-interactions + `nonReentrant`. Prize bps must sum
   to 100% in every unclaimed-line combination (the tests assert this).
5. **Host-safe I/O only.** The product sandbox forbids direct HTTP. So:
   - Reads go through `ReviveApi.call` **dry-run** (viem-encoded calldata), never a viem
     `PublicClient`.
   - Chain transport is WebSocket PAPI: `getHostProvider` in host mode, `getWsProvider`
     standalone. This selection lives **only** in `src/lib/chain/client.ts`.
   - Host detection lives **only** in `src/lib/host/detect.ts`.
6. **Reach TrUAPI through `src/lib` wrappers**, not raw SDK imports in components. Every
   host getter (`getChatManager`, `getHostProvider`, …) **returns `null` outside a
   host** — always handle that branch; standalone must degrade, not crash.
7. **Keep chain constants in one place.** `CHAIN` (`src/lib/chain/constants.ts`) and the
   contract constants must agree — especially block time and `BLOCKS_BETWEEN_DRAWS`.
   Read on-chain constants where you can instead of hardcoding a second copy.
8. **Single-document SPA is non-negotiable.** The host and DotNS gateways only ever
   serve the root document — direct path access is unsupported by design. All routes
   live in the URL hash (`/#/game/1`) via the minimal router in `src/lib/router.tsx`;
   never add path-based routing or anything that needs a Node server. Env config is
   baked in at build time (`define` in both Vite configs) — the product sandbox has
   no `process` at runtime.

## Commands

```bash
bun install

# contract tests — VANILLA forge
export PATH="$HOME/.foundry/bin:$PATH"
forge test -vv                         # keep green; 19 cases today

# compile to PolkaVM — POLKADOT forge + seeded resolc 0.6.0
export PATH="$HOME/.foundry-polkadot/bin:$PATH"
forge build --resolc                   # → target/cdm/foundry/Tambola.polkavm

# deploy contract, then paste the printed H160 into .env.local
playground contract deploy --signer dev --env paseo-next-v2   # NEXT_PUBLIC_TAMBOLA_ADDRESS=0x...

# generate PAPI descriptors (for typed api.tx.Revive.* paths)
bun run papi:add

# dev UI (standalone mode) / full deploy
bun run dev
bun run build && playground deploy --signer dev --domain tambola-game --buildDir ./out --env paseo-next-v2 --playground
```

## Environment gotchas

- **Two `forge` binaries.** Vanilla `~/.foundry/bin/forge` runs tests; polkadot
  `~/.foundry-polkadot/bin/forge` does `--resolc`/deploy. Put the right one first on
  `PATH` for the task at hand.
- **`resolc 0.6.0` is seeded** at `~/.rvm/0.6.0/` (the 180 MB auto-download is flaky in
  the sandbox). On a fresh machine, recreate the seed or allow the download.
- **Outputs collide by default.** Foundry writes `forge-out/`; Vite writes `out/`
  (app) and `out/worker/`. Keep `foundry.toml`'s `out = "forge-out"`, and keep the
  app→worker build order (`bun run build`) — the app build empties `out/` first.

## Open issues to respect (details in ARCHITECTURE.md §9)

- PAPI v2 + this runtime: `H160` args are hex strings (never `Binary`), `Bytes`
  results are `Uint8Array`, and dry-run origins must be revive-mapped accounts.
- **Planck vs wei.** `Revive.call { value }` is native planck, but the contract sees
  `value × NATIVE_TO_ETH_RATIO` (10^8) as msg.value, and stores every amount in that
  18-dec wei. The app works in planck; conversion happens only in
  `src/lib/tambola/{read,write,events}.ts` (see `NATIVE_TO_ETH_RATIO` in
  `src/lib/chain/constants.ts`). Passing planck straight into a contract amount arg
  produces "wrong price"-style reverts.
- Contract deploys must use `--signer dev` — the CDM package `@tambola/tambola` is
  owned by the dev signer's mapped H160. Each deploy creates a fresh instance; keep
  `.env.local` pointing at the one you mean.
- Bulletin metadata publish pending (testnet Bulletin chain stalled 2026-07-06).

## Definition of done for a change

Contract change → `forge test -vv` green **and** every mirror in rule 1 updated.
Frontend change → typechecks, `bun run build` produces a clean static bundle, and the
host-vs-standalone branch is handled. Don't commit unless asked; when you do, one
logical change per commit with a message that says what landed and what was deferred.
