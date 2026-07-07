/**
 * Wallet / signer manager. Wraps `@parity/product-sdk-signer`'s `SignerManager`
 * so the rest of the app can subscribe via a single instance.
 *
 * Hosts don't enumerate wallet accounts for products — each product gets an
 * app-scoped *product account* derived from its DotNS identifier (the pattern
 * in paritytech/playground-app and dotli-starter). Localhost dev uses a fixed
 * `localhost` identifier; deployed builds use the registered `.dot` name.
 */

import { HostProvider, SignerManager } from "@parity/product-sdk-signer";
import { requestPermission } from "@parity/product-sdk-host";
import { isHostAsync } from "@/lib/host/detect";

const DEPLOYED_DOTNS = "tambola-game.dot";

export const signerManager = new SignerManager({
  dappName: "tambola",
  createProvider: () =>
    new HostProvider({
      productAccount: { dotNsIdentifier: DEPLOYED_DOTNS, requestName: false },
    }),
});

/**
 * The host gates signing on the `ChainSubmit` permission; when it's missing a
 * sign request hangs silently instead of erroring. Re-request it in the click
 * context right before each transaction — an already-granted permission
 * resolves instantly, an ungranted one makes the host show its approval
 * prompt, and a denial becomes a visible error instead of a hang.
 */
export async function ensureChainSubmitPermission(): Promise<void> {
  if (!(await isHostAsync())) return; // standalone signing has no host gate
  const result = await requestPermission({ tag: "ChainSubmit", value: undefined });
  if (!result.ok) {
    throw new Error(`Could not request transaction permission from the host: ${result.error.message}`);
  }
  if (!result.value) {
    throw new Error("The host denied permission to submit transactions.");
  }
}

let connectPromise: Promise<unknown> | null = null;

// Only cache a successful connect — a failure (e.g. host bridge not ready yet)
// must stay retryable or the UI is stuck disconnected until a full reload.
export function ensureSignerConnected() {
  if (!connectPromise) {
    connectPromise = signerManager.connect().then(
      (res) => {
        if (!res.ok) connectPromise = null;
        return res;
      },
      (e) => {
        connectPromise = null;
        throw e;
      },
    );
  }
  return connectPromise;
}
