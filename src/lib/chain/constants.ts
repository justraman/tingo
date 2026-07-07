/**
 * paseo-next-v2 Asset Hub config. `playground-cli` provides matching defaults
 * server-side; these values are surfaced to the React app via NEXT_PUBLIC_* env.
 */

export const CHAIN = {
  name: process.env.NEXT_PUBLIC_CHAIN_NAME ?? "paseo-asset-hub-next",
  genesis: (process.env.NEXT_PUBLIC_CHAIN_GENESIS ??
    "0xbf0488dbe9daa1de1c08c5f743e26fdc2a4ecd74cf87dd1b4b1eeb99ae4ef19f") as `0x${string}`,
  rpc: process.env.NEXT_PUBLIC_CHAIN_RPC ?? "wss://paseo-asset-hub-next-rpc.polkadot.io",
  decimals: Number(process.env.NEXT_PUBLIC_TOKEN_DECIMALS ?? "10"),
  symbol: process.env.NEXT_PUBLIC_TOKEN_SYMBOL ?? "PAS",
};

export const TAMBOLA_ADDRESS =
  (process.env.NEXT_PUBLIC_TAMBOLA_ADDRESS ?? "0x0000000000000000000000000000000000000000") as `0x${string}`;

export const BLOCK_TIME_SECONDS = 2;

// Mirror of Tambola.BLOCKS_BETWEEN_DRAWS — keep in lockstep with the contract.
export const BLOCKS_BETWEEN_DRAWS = 5;

// pallet-revive maps the native balance onto the EVM's 18 decimals: a
// `Revive.call { value }` is planck, but the contract sees `value × RATIO` as
// msg.value, and every contract-side amount (ticketPrice, pot, withdrawable,
// event payouts) is in that 18-decimal "wei". The app works in planck; convert
// only at the src/lib/tambola read/write/event boundary.
export const NATIVE_TO_ETH_RATIO = 10n ** BigInt(18 - CHAIN.decimals);

// Must be an account with an existing Revive mapping: the runtime rejects even
// dry-run calls from unmapped origins (AccountUnmapped). The dev deploy signer
// is mapped as a side effect of deploying the contract.
export const READ_ONLY_ORIGIN = "5DfhGyQdFobKM8NsWvEeAKk5EQQgYe9AydgJ7rMB6E1EqRzV";
