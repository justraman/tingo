/**
 * Chat over the Statement Store — the host's TrUAPI chat API is not
 * implemented yet. Each game is a topic2 room; the statement subscription
 * replays unexpired messages, so mounting the hook backfills recent chat.
 */

import { useMemo } from "react";
import { ss58Encode, useStatements } from "@use-truapi/react";
import { truapi } from "@/lib/truapi";
import { CHAT_NAME_MAX, roomIdForGame, type ChatPayload } from "./protocol";

export interface ChatMessage {
  from: string;        // sender SS58 derived from the statement signer key
  name?: string;       // sender's chosen chat name, when they shared one
  text: string;
}

// The statement signer key IS the original account — no reverse lookup
// needed, its SS58 encodes directly from the public key.
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

/** Live message list for a game's chat room; empty and inert standalone. */
export function useGameChat(gameId: bigint): ChatMessage[] {
  const statements = useStatements<ChatPayload>({ topic2: roomIdForGame(gameId) });
  const data = statements.data;
  return useMemo(
    () =>
      (data ?? [])
        .filter((s) => typeof s.data?.text === "string")
        .map((s) => ({
          from: ss58FromSignerHex(s.signerHex),
          name:
            typeof s.data.name === "string"
              ? s.data.name.trim().slice(0, CHAT_NAME_MAX) || undefined
              : undefined,
          text: s.data.text,
        })),
    [data],
  );
}

export async function sendChat(gameId: bigint, text: string, name?: string): Promise<void> {
  const payload: ChatPayload = name ? { text, name } : { text };
  const accepted = await truapi.statements.publish(payload, { topic2: roomIdForGame(gameId) });
  if (!accepted) throw new Error("chat message rejected by statement store (not in host?)");
}
