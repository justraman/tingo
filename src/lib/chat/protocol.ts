// Shared between the UI and the Cloudflare worker — both must agree on the
// app topic and per-game room topic or messages won't route.

export const CHAT_APP_NAME = "tambola-game";
export const CHAT_TTL_SECONDS = 24*60*60; // 24 hour

export interface ChatPayload {
  text: string;
  /** Sender's TrUAPI primary username; receivers fall back to the signer's SS58. */
  name?: string;
}

export const CHAT_NAME_MAX = 32;

export function roomIdForGame(gameId: bigint): string {
  return `tambola-${gameId.toString()}`;
}

export const REACTION_EMOJIS: readonly string[] = ["❤️", "😂", "😮", "😢", "🎉"];

/** Short-lived on purpose: the subscription replays unexpired statements, so a
 * long TTL would rain stale reactions on everyone who opens the game. */
export const REACTION_TTL_SECONDS = 30;

export interface ReactionPayload {
  e: string;
  /** Sender's clock in ms — receivers drop replays older than a few seconds. */
  ts: number;
  /** True for a full-screen rain burst; absent for a single floating reaction. */
  rain?: boolean;
}

export function reactionRoomForGame(gameId: bigint): string {
  return `tambola-${gameId.toString()}-reactions`;
}
