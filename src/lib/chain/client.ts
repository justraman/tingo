/**
 * PAPI client singleton, scoped per genesis hash.
 *
 * Inside the host: provider comes from `@parity/product-sdk-host` (host owns
 * the WS connection, no direct outbound network access allowed).
 *
 * Standalone fallback: a regular WS provider. The Triangle host blocks direct
 * HTTP — but plain WebSocket to the chain RPC is allowed in both modes, and
 * standalone is what local `next dev` runs as until we open the page inside
 * the host browser.
 */

import { createClient, type PolkadotClient } from "polkadot-api";
import { getWsProvider } from "polkadot-api/ws";
import { getHostProvider } from "@parity/product-sdk-host";
import { CHAIN } from "./constants";
import { isHostAsync } from "@/lib/host/detect";

const clients = new Map<string, PolkadotClient>();

export async function getClient(genesis: `0x${string}` = CHAIN.genesis): Promise<PolkadotClient> {
  const key = genesis;
  let c = clients.get(key);
  if (c) return c;

  const inHost = await isHostAsync();
  const provider = inHost ? await getHostProvider(genesis) : getWsProvider(CHAIN.rpc);
  if (!provider) throw new Error(`No provider for ${genesis} (host=${inHost})`);
  c = createClient(provider);
  clients.set(key, c);
  return c;
}

/** Forcefully close all clients — call only on app shutdown. */
export function destroyClients() {
  for (const [k, c] of clients) {
    try { c.destroy(); } catch { /* ignore */ }
    clients.delete(k);
  }
}
