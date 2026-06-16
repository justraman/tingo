/**
 * paseo-next-v2 Asset Hub config. `playground-cli` provides matching defaults
 * server-side; these values are surfaced to the React app via NEXT_PUBLIC_* env.
 */

export const CHAIN = {
  name: process.env.NEXT_PUBLIC_CHAIN_NAME ?? "paseo-asset-hub-next",
  genesis: (process.env.NEXT_PUBLIC_CHAIN_GENESIS ??
    "0xbf0488c1da81db8e9b5b1ba31bc20b2cad97a83a4e92e7b71c7c4f6a02b86c01") as `0x${string}`,
  rpc: process.env.NEXT_PUBLIC_CHAIN_RPC ?? "wss://paseo-asset-hub-next-rpc.polkadot.io",
  decimals: Number(process.env.NEXT_PUBLIC_TOKEN_DECIMALS ?? "10"),
  symbol: process.env.NEXT_PUBLIC_TOKEN_SYMBOL ?? "PAS",
  blockTimeSec: 6,
};

export const TAMBOLA_ADDRESS =
  (process.env.NEXT_PUBLIC_TAMBOLA_ADDRESS ?? "0x0000000000000000000000000000000000000000") as `0x${string}`;

export const READ_ONLY_ORIGIN = "5C4hrfjw9DjXZTzV3MwzrrAr9P1MJhSrvWGWqi1eSuyUpnhM";
