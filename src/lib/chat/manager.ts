/**
 * Chat over the Statement Store — the host's TrUAPI chat API is not
 * implemented yet. Each game is a topic2 room; incoming statements are pushed
 * into the zustand chat store via `attachChatSubscription()`.
 */

import { StatementStoreClient } from "@parity/product-sdk-statement-store";
import { ss58Encode } from "@parity/product-sdk-address";
import { isHostAsync } from "@/lib/host/detect";
import { getPrimaryUsername } from "@/lib/host/identity";
import { useChatStore } from "@/lib/store/chat";
import { CHAT_APP_NAME, CHAT_NAME_MAX, CHAT_TTL_SECONDS, roomIdForGame, type ChatPayload } from "./protocol";

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
  const name = (await getPrimaryUsername().catch(() => null)) ?? undefined;
  const payload: ChatPayload = name ? { text, name } : { text };
  const accepted = await client.publish<ChatPayload>(payload, { topic2: roomIdForGame(gameId) });
  if (!accepted) throw new Error("chat message rejected by statement store");
}

function ss58FromSignerHex(signerHex: string | undefined): string {
  if (!signerHex) return "anon";
  const hex = signerHex.startsWith("0x") ? signerHex.slice(2) : signerHex;
  if (hex.length !== 64) return signerHex;
  const bytes = new Uint8Array(32);
  for (let i = 0; i < 32; i++) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  try {
    return ss58Encode(bytes);
  } catch {
    return signerHex;
  }
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
      const name = typeof statement.data.name === "string"
        ? statement.data.name.trim().slice(0, CHAT_NAME_MAX) || undefined
        : undefined;
      useChatStore.getState().append(gameId, {
        from: ss58FromSignerHex(statement.signerHex),
        name,
        text: statement.data.text,
        ts: Date.now(),
      });
    },
    { topic2: roomIdForGame(gameId) },
  );
}
