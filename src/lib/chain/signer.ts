/**
 * Wallet / signer manager. Wraps `@parity/product-sdk-signer`'s `SignerManager`
 * so the rest of the app can subscribe via a single instance.
 *
 * Pattern lifted from `paritytech/host-playground/src/lib/signer.ts`.
 */

import { SignerManager } from "@parity/product-sdk-signer";

export const signerManager = new SignerManager({ dappName: "tambola" });

let connectPromise: Promise<unknown> | null = null;

export function ensureSignerConnected() {
  if (!connectPromise) connectPromise = signerManager.connect();
  return connectPromise;
}
