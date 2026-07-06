/**
 * Wallet / signer manager. Wraps `@parity/product-sdk-signer`'s `SignerManager`
 * so the rest of the app can subscribe via a single instance.
 *
 * Hosts don't enumerate wallet accounts for products — each product gets an
 * app-scoped *product account* derived from its DotNS identifier (the pattern
 * in paritytech/playground-app and dotli-starter). Localhost dev keeps the
 * `host:port` identifier; deployed builds use the registered `.dot` name.
 */

import { HostProvider, SignerManager } from "@parity/product-sdk-signer";

const DEPLOYED_DOTNS = "tambola-game.dot";

function selfDotNsIdentifier(): string {
  if (typeof window === "undefined") return DEPLOYED_DOTNS;
  const hostname = window.location.hostname.toLowerCase();
  if (hostname === "localhost" || hostname === "127.0.0.1" || hostname.endsWith(".localhost")) {
    return window.location.host.toLowerCase();
  }
  if (hostname.endsWith(".dot")) {
    const segments = hostname.split(".");
    return segments.length > 2 ? segments.slice(-2).join(".") : hostname;
  }
  return DEPLOYED_DOTNS;
}

export const signerManager = new SignerManager({
  dappName: "tambola",
  createProvider: () =>
    new HostProvider({
      productAccount: { dotNsIdentifier: selfDotNsIdentifier(), requestName: false },
    }),
});

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
