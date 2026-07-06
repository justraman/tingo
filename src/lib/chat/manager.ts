/**
 * Chat over the Statement Store — the host's TrUAPI chat API is not
 * implemented yet. Each game is a topic2 room; incoming statements are pushed
 * into the zustand chat store via `attachChatSubscription()`.
 */

import { StatementStoreClient } from "@parity/product-sdk-statement-store";
import { isHostAsync } from "@/lib/host/detect";
import { useChatStore } from "@/lib/store/chat";
import { CHAT_APP_NAME, CHAT_TTL_SECONDS, roomIdForGame, type ChatPayload } from "./protocol";

export { roomIdForGame };

let clientPromise: Promise<StatementStoreClient | null> | null = null;

// Only cache a successful connect — a failure (e.g. host bridge not ready yet)
// must stay retryable. Resolves null standalone; chat degrades, never crashes.
function getChatClient(): Promise<StatementStoreClient | null> {
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

export async function sendChat(gameId: bigint, text: string) {
  const client = await getChatClient();
  if (!client) throw new Error("chat unavailable (not in host?)");
  const accepted = await client.publish<ChatPayload>({ text }, { topic2: roomIdForGame(gameId) });
  if (!accepted) throw new Error("chat message rejected by statement store");
}

const subscribedGames = new Set<string>();

/** Subscribe once per game; the statement subscription replays unexpired messages. */
export async function attachChatSubscription(gameId: bigint) {
  const key = gameId.toString();
  if (subscribedGames.has(key)) return;
  const client = await getChatClient().catch(() => null);
  if (!client || subscribedGames.has(key)) return;
  subscribedGames.add(key);
  client.subscribe<ChatPayload>(
    (statement) => {
      if (typeof statement.data?.text !== "string") return;
      useChatStore.getState().append(gameId, {
        from: statement.signerHex ?? "anon",
        text: statement.data.text,
        ts: Date.now(),
      });
    },
    { topic2: roomIdForGame(gameId) },
  );
}
