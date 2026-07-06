/**
 * Wrapper around the Triangle Chat manager so app code doesn't import the SDK
 * directly. Sending a message is fire-and-forget; incoming messages are pushed
 * into the zustand chat store via `attachChatSubscription()`.
 */

import { getChatManager } from "@parity/product-sdk-host";
import { useChatStore } from "@/lib/store/chat";

export function roomIdForGame(gameId: bigint): string {
  return `tambola-${gameId.toString()}`;
}

export async function sendChat(gameId: bigint, text: string) {
  const mgr = await getChatManager();
  if (!mgr) throw new Error("chat manager unavailable (not in host?)");
  await mgr.sendMessage(roomIdForGame(gameId), { tag: "Text", value: { text } });
}

let subscribed = false;

/** Attach a single global subscription that funnels chat events into the store. */
export async function attachChatSubscription() {
  if (subscribed) return;
  const mgr = await getChatManager();
  if (!mgr) return; // standalone — no chat
  subscribed = true;
  mgr.subscribeAction((action: any) => {
    if (!action?.roomId?.startsWith("tambola-")) return;
    if (action.payload?.tag !== "MessagePosted")  return;
    if (action.payload?.value?.tag !== "Text")    return;
    const gameId = BigInt(action.roomId.slice("tambola-".length));
    useChatStore.getState().append(gameId, {
      from: action.peer ?? "anon",
      text: action.payload.value.value.text,
      ts: Date.now(),
    });
  });
}
