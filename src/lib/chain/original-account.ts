/**
 * Reverse of pallet-revive's account mapping: H160 → the registered
 * AccountId32, via the `Revive.OriginalAccount` storage map. Every account
 * that has interacted with the contract is in this registry (`map_account`
 * runs before its first call), so lookups miss only for eth-native or
 * never-seen addresses.
 */

import { toGenericSs58 } from "@use-truapi/core";
import { truapi } from "@/lib/truapi";

const cache = new Map<string, Promise<string | null>>();

export function resolveOriginalSs58(h160: string): Promise<string | null> {
  const key = h160.toLowerCase();
  const hit = cache.get(key);
  if (hit) return hit;
  const lookup = (async () => {
    const client = await truapi.chains.getClient();
    const unsafe = (client as unknown as { getUnsafeApi: () => any }).getUnsafeApi();
    const ss58 = await unsafe.query.Revive.OriginalAccount.getValue(key);
    // PAPI encodes the stored AccountId32 at prefix 0; the app displays
    // everything at generic 42 (what the signer hands out).
    return ss58 ? toGenericSs58(ss58 as string) : null;
  })();
  lookup.catch(() => cache.delete(key));
  cache.set(key, lookup);
  return lookup;
}
