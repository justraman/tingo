# 🎯 Tambola

A Polkadot **Triangle** dApp where the smart contract is the referee: it owns the pot,
validates tickets, draws numbers with on-chain randomness, and pays out winners. No
backend, no trusted RNG server, no custodial wallet.

- **Contract** (`contracts/Tambola.sol`) — Solidity on **pallet-revive / PolkaVM**
  (Asset Hub, `paseo-next-v2`). Holds many concurrent games; pays
  15 / 15 / 15 / 50 / 5 to top-line / middle-line / bottom-line / full-house / host.
- **Frontend** (`src/`) — Vite + React SPA + shadcn, runs **inside a Polkadot host**
  (Desktop / Mobile / Web) as a sandboxed product. Hosts only serve the root
  document, so the URL stays at `/` and routing is internal app state.
- **Worker** (`worker/index.ts`) — runs in the host's worker sandbox: registers a chat
  room per game and pokes the permissionless `drawNumber` forward.

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
