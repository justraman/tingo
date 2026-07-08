import { getChatClient } from "./client";
import { REACTION_EMOJIS, REACTION_TTL_SECONDS, reactionRoomForGame, type ReactionPayload } from "./protocol";

const REACTION_MAX_AGE_MS = 15_000;

type ReactionListener = (emoji: string) => void;

const listeners = new Map<string, Set<ReactionListener>>();
const subscribedGames = new Set<string>();
const seen = new Set<string>();
const locallyRained = new Set<string>();

function emit(gameKey: string, emoji: string) {
  listeners.get(gameKey)?.forEach((l) => l(emoji));
}

/** Register a rain callback for a game; lazily opens the statement subscription. */
export function onReaction(gameId: bigint, listener: ReactionListener): () => void {
  const key = gameId.toString();
  let set = listeners.get(key);
  if (!set) listeners.set(key, (set = new Set()));
  set.add(listener);
  void subscribeReactions(gameId);
  return () => { set.delete(listener); };
}

async function subscribeReactions(gameId: bigint) {
  const key = gameId.toString();
  if (subscribedGames.has(key)) return;
  const client = await getChatClient().catch(() => null);
  if (!client || subscribedGames.has(key)) return;
  subscribedGames.add(key);
  client.subscribe<ReactionPayload>(
    (statement) => {
      const { e, ts } = statement.data ?? {};
      if (typeof e !== "string" || typeof ts !== "number") return;
      if (!REACTION_EMOJIS.includes(e)) return;
      if (Date.now() - ts > REACTION_MAX_AGE_MS) return;
      if (locallyRained.delete(`${e}:${ts}`)) return;   // own send already rained
      const dedupeKey = `${statement.signerHex ?? "?"}:${e}:${ts}`;
      if (seen.has(dedupeKey)) return;
      seen.add(dedupeKey);
      emit(key, e);
    },
    { topic2: reactionRoomForGame(gameId) },
  );
}

/** Rain locally right away; broadcast best-effort (standalone stays local-only). */
export async function sendReaction(gameId: bigint, emoji: string) {
  const ts = Date.now();
  emit(gameId.toString(), emoji);
  locallyRained.add(`${emoji}:${ts}`);
  const client = await getChatClient().catch(() => null);
  if (!client) return;
  await client.publish<ReactionPayload>({ e: emoji, ts }, {
    topic2: reactionRoomForGame(gameId),
    ttlSeconds: REACTION_TTL_SECONDS,
  });
}
