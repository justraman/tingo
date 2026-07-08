import { getAccountsProvider } from "@parity/product-sdk-host";
import { isHostAsync } from "./detect";

let cached: string | null | undefined;

/** The host user's primary username via TrUAPI, or null standalone / not logged in. */
export async function getPrimaryUsername(): Promise<string | null> {
  if (cached !== undefined) return cached;
  if (!(await isHostAsync())) return (cached = null);
  const provider = await getAccountsProvider();
  if (!provider) return (cached = null);
  cached = await provider.getUserId().match(
    (id) => id.primaryUsername || null,
    () => null,
  );
  return cached;
}
