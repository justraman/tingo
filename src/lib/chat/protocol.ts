// Shared between the UI and the Cloudflare worker — both must agree on the
// app topic and per-game room topic or messages won't route.

export const CHAT_APP_NAME = "tambola-game";
export const CHAT_TTL_SECONDS = 300;

export interface ChatPayload {
  text: string;
  /** Sender's TrUAPI primary username; receivers fall back to the signer's SS58. */
  name?: string;
}

export const CHAT_NAME_MAX = 32;

export function roomIdForGame(gameId: bigint): string {
  return `tambola-${gameId.toString()}`;
}
