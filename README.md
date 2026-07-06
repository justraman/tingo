# 🎯 Tambola — on-chain Indian Bingo on Polkadot

A Polkadot **Triangle** dApp where the smart contract is the referee: it owns the pot,
validates tickets, draws numbers with on-chain randomness, and pays out winners. No
backend, no trusted RNG server, no custodial wallet.

- **Contract** (`contracts/Tambola.sol`) — Solidity on **pallet-revive / PolkaVM**
  (Asset Hub, `paseo-next-v2`). Holds many concurrent games; pays
  15 / 15 / 15 / 50 / 5 to top-line / middle-line / bottom-line / full-house / host.
- **Frontend** (`app/`, `src/`) — Next.js 15 static export + shadcn, runs **inside a
  Polkadot host** (Desktop / Mobile / Web) as a sandboxed product.
- **Worker** (`worker/index.ts`) — runs in the host's worker sandbox: registers a chat
  room per game and pokes the permissionless `drawNumber` forward.

> New here? Read **[`ARCHITECTURE.md`](./ARCHITECTURE.md)** for the full picture and
> **[`CLAUDE.md`](./CLAUDE.md)** for the coding rules.

## How it talks to the host (TrUAPI)

The app does not run as a normal web page — it runs embedded in a host that holds the
user's keys and the chain connections. It reaches them through **TrUAPI** (*Triangle
User-Agent Programming Interface*, <https://paritytech.github.io/truapi/>), the host's
**constrained, permissioned capability API**, consumed via `@parity/product-sdk-host`:

| Need              | TrUAPI surface used                         |
|-------------------|---------------------------------------------|
| Chain connection  | `getHostProvider(genesis)` → PAPI provider  |
| Sign & submit     | host signing / `@parity/product-sdk-signer` |
| In-game chat      | `getChatManager()` (room per game)          |
| Host detection    | `isInsideContainer()`                        |

The sandbox forbids direct HTTP, so **reads** go through `ReviveApi.call` dry-runs and
all chain traffic is WebSocket PAPI. Outside a host (`next dev`) the app degrades to a
standalone WS connection for UI iteration.

## Prize split

| Pattern      | Share |
|--------------|------:|
| Top line     |  15 % |
| Middle line  |  15 % |
| Bottom line  |  15 % |
| Full house   |  50 % |
| Host fee     |   5 % |

Lines pay the first ticket to complete them. The game ends **only** on a full house;
unclaimed line shares roll into the full-house payout. If all 90 numbers are drawn with
no full house, every ticket holder can claim a refund. Winnings settle to a
pull-payment ledger — call `withdraw()` to receive funds.

## Project structure

```
contracts/   Tambola.sol + ITambola.sol         (the referee)
test/        Tambola.t.sol                       (Foundry, 19 cases)
app/         Next.js routes: / · /host/new · /game/{id}
src/lib/     chain/ (client·signer·constants) · tambola/ (read·write·events·ticket·encode·abi)
             host/ (detect) · chat/ (manager) · store/ (zustand)
src/components/  TicketGrid · NumberBoard · Countdown · TicketGenerator · ChatPanel · WinnerBanner
worker/      index.ts (chat + draw poker) + vite.config.ts
```

## Quick start

```bash
bun install
curl -fsSL https://raw.githubusercontent.com/paritytech/playground-cli/main/install.sh | bash

# 1. test + compile the contract (note: two different forge binaries — see CLAUDE.md)
export PATH="$HOME/.foundry/bin:$PATH" && forge test -vv
export PATH="$HOME/.foundry-polkadot/bin:$PATH" && forge build --resolc

# 2. deploy the contract → paste the printed H160 into .env.local as NEXT_PUBLIC_TAMBOLA_ADDRESS
playground contract deploy --signer dev --env paseo-next-v2

# 3. generate PAPI descriptors
bun run papi:add

# 4. dev loop (open inside Polkadot Desktop for full host features)
bun run dev

# 5. deploy app + worker to Bulletin / IPFS + DotNS
bun run build && playground deploy --signer dev --domain tambola-game --buildDir ./out --env paseo-next-v2 --playground
```

See **[`PROGRESS.md`](./PROGRESS.md)** for current status and the road to a live game.

## Reference repos

- `justraman/tambola` — original Vue 2 + Firebase version; its ticket generator + win
  checker are ported into `src/lib/tambola/ticket.ts`.
- `paritytech/truapi` — the canonical host ↔ product protocol (the "constraint API").
- `paritytech/host-playground` — canonical Triangle SDK example; client / signer / chat
  are modelled after it.
- `paritytech/playground-cli` — deploys the contract to Asset Hub and the app to
  Bulletin + DotNS.
