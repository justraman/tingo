import { StatementStoreClient } from "@parity/product-sdk-statement-store";
import { isHostAsync } from "@/lib/host/detect";
import { CHAT_APP_NAME, CHAT_TTL_SECONDS } from "./protocol";

let clientPromise: Promise<StatementStoreClient | null> | null = null;

// Only cache a successful connect — a failure (e.g. host bridge not ready yet)
// must stay retryable. Resolves null standalone; chat degrades, never crashes.
export function getChatClient(): Promise<StatementStoreClient | null> {
  if (!clientPromise) {
    clientPromise = connectClient().catch((e) => {
      clientPromise = null;
      throw e;
    });
  }
  return clientPromise;
}

async function connectClient(): Promise<StatementStoreClient | null> {
  if (!(await isHostAsync())) return null;
  const client = new StatementStoreClient({
    appName: CHAT_APP_NAME,
    defaultTtlSeconds: CHAT_TTL_SECONDS,
  });
  await client.connect({ mode: "host" });
  return client;
}
