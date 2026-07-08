import { paseo_asset_hub } from "@polkadot-api/descriptors";
import { getClient } from "./client";

/** Watch an account's free native balance (planck) on best blocks. */
export function watchFreeBalance(address: string, onValue: (planck: bigint) => void): () => void {
  let sub: { unsubscribe(): void } | undefined;
  let cancelled = false;
  void getClient()
    .then((client) => {
      if (cancelled) return;
      const api = client.getTypedApi(paseo_asset_hub);
      sub = api.query.System.Account.watchValue(address, { at: "best" }).subscribe({
        next: ({ value }) => onValue(value.data.free as bigint),
        error: (e: unknown) => console.error("balance watch failed", e),
      });
    })
    .catch((e) => console.error("balance watch failed", e));
  return () => { cancelled = true; sub?.unsubscribe(); };
}
