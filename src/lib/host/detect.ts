/**
 * Three-way host detection: are we inside Polkadot Desktop / Mobile webview,
 * a web iframe host, or running standalone in a regular browser tab?
 *
 * Wraps `@parity/product-sdk-host`'s helpers and adds a single async-resolved
 * cache so React components don't re-run detection on every render.
 */

import { isInsideContainer, isInsideContainerSync } from "@parity/product-sdk-host";

let cached: boolean | null = null;
let pending: Promise<boolean> | null = null;

export function isHostSync(): boolean {
  if (cached !== null) return cached;
  return isInsideContainerSync();
}

export async function isHostAsync(): Promise<boolean> {
  if (cached !== null) return cached;
  if (!pending) {
    pending = isInsideContainer().then((inside) => {
      cached = inside;
      return inside;
    });
  }
  return pending;
}

export type HostMode = "host" | "standalone" | "unknown";

export function hostMode(): HostMode {
  if (cached === null) return "unknown";
  return cached ? "host" : "standalone";
}
