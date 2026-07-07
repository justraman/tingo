/**
 * PAPI client singleton, scoped per genesis hash.
 *
 * Inside the host: provider comes from `@parity/product-sdk-host` (host owns
 * the WS connection, no direct outbound network access allowed).
 *
 * Standalone fallback: a regular WS provider. The Triangle host blocks direct
 * HTTP — but plain WebSocket to the chain RPC is allowed in both modes, and
 * standalone is what local `bun run dev` runs as until we open the page inside
 * the host browser.
 */

import { createClient, type PolkadotClient } from "polkadot-api";
import { getWsProvider } from "polkadot-api/ws";
import { getHostProvider } from "@parity/product-sdk-host";
import { CHAIN } from "./constants";
import { isHostAsync } from "@/lib/host/detect";

const HOST_PROVIDER_TIMEOUT_MS = 15_000;

// The promise is cached (not the client) so concurrent callers share one
// in-flight connection instead of racing to create two host providers.
const clients = new Map<string, Promise<PolkadotClient>>();

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms),
    ),
  ]);
}

async function buildClient(genesis: `0x${string}`): Promise<PolkadotClient> {
  const inHost = await isHostAsync();
  // A dead host channel would otherwise hang every request forever with no
  // rejection — cap the provider acquisition so the failure is visible.
  const provider = inHost
    ? await withTimeout(getHostProvider(genesis), HOST_PROVIDER_TIMEOUT_MS, "host chain provider")
    : getWsProvider(CHAIN.rpc);
  if (!provider) throw new Error(`No provider for ${genesis} (host=${inHost})`);
  return createClient(provider);
}

export function getClient(genesis: `0x${string}` = CHAIN.genesis): Promise<PolkadotClient> {
  let c = clients.get(genesis);
  if (!c) {
    c = buildClient(genesis);
    c.catch(() => clients.delete(genesis)); // failures stay retryable
    clients.set(genesis, c);
  }
  return c;
}

/** Forcefully close all clients — call only on app shutdown. */
export function destroyClients() {
  for (const p of clients.values()) {
    p.then((c) => c.destroy()).catch(() => { /* ignore */ });
  }
  clients.clear();
}
