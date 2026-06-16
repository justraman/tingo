# Tambola — on-chain Indian Bingo on Polkadot

A Polkadot Triangle dApp where the smart contract owns the pot, validates
tickets, draws numbers, and pays out winners. No backend Firebase, no
relayer-trusted RNG.

## Architecture

- **Contract** (`contracts/Tambola.sol`) — Solidity on pallet-revive
  (paseo-next-v2 Asset Hub). Holds games, tickets, draw history, pot, and
  pays out 15/15/15/50/5 to top-line / middle-line / bottom-line / full-house
  / host.
- **Frontend** (`app/`, `src/`) — Next.js + shadcn, runs inside Polkadot
  Desktop / Mobile / Web hosts via `@parity/product-sdk-host`.
- **Worker** (`worker/index.ts`) — runs inside the host's worker sandbox.
  Registers a chat room per game and pokes `drawNumber` every 4 blocks.

## Quick start (paseo-next-v2)

```bash
# 0. install
npm install
curl -fsSL https://raw.githubusercontent.com/paritytech/playground-cli/main/install.sh | bash

# 1. compile and test the contract
npm run compile:contract
npm run test:contract

# 2. deploy the contract
export MNEMONIC="..."
npm run deploy:contract       # prints H160 → write into .env.local NEXT_PUBLIC_TAMBOLA_ADDRESS

# 3. generate PAPI chain descriptors
npx papi add paseo_asset_hub -w wss://paseo-asset-hub-next-rpc.polkadot.io

# 4. dev loop (open in Polkadot Desktop)
npm run dev

# 5. deploy the frontend + worker
npm run deploy:app
```

## Prize split

| Pattern        | Share |
|----------------|------:|
| Top line       |  15 % |
| Middle line    |  15 % |
| Bottom line    |  15 % |
| Full house     |  50 % |
| Host fee       |   5 % |

Lines pay the first ticket to complete them. The game continues until a
full house is found. Unclaimed line shares roll into the full-house payout.
If all 90 numbers are drawn without a full house, every ticket holder can
claim a refund.

## Reference repos

- `justraman/tambola` — original Vue 2 + Firebase implementation; ticket
  generator + win checker ported into `src/lib/tambola/ticket.ts`.
- `paritytech/host-playground` — canonical Triangle SDK example; we model
  client / signer / chat after it.
- `paritytech/playground-cli` — deploys the contract to Asset Hub and the
  frontend to Bulletin + DotNS.
