import { truapi } from "@/lib/truapi";
import { REACTION_EMOJIS, REACTION_TTL_SECONDS, reactionRoomForGame, type ReactionPayload } from "./protocol";

const REACTION_MAX_AGE_MS = 15_000;

// A hundred players tapping along must not flood the statement store: singles
// are throttled per client (every press still floats locally); rain bursts
// are rare by design (5-press trigger + 1 min cooldown) and always publish.
const SINGLE_PUBLISH_MIN_INTERVAL_MS = 400;

type ReactionListener = (emoji: string, rain: boolean) => void;

const listeners = new Map<string, Set<ReactionListener>>();
const subscribedGames = new Set<string>();
const seen = new Set<string>();
const locallyShown = new Set<string>();
let lastSinglePublishAt = 0;

function emit(gameKey: string, emoji: string, rain: boolean) {
  listeners.get(gameKey)?.forEach((l) => l(emoji, rain));
}

/** Register a reaction callback for a game; lazily opens the statement subscription. */
export function onReaction(gameId: bigint, listener: ReactionListener): () => void {
  const key = gameId.toString();
  let set = listeners.get(key);
  if (!set) listeners.set(key, (set = new Set()));
  set.add(listener);
  subscribeReactions(gameId);
  return () => { set.delete(listener); };
}

// The statements controller resolves its client lazily and stays inert
// standalone, so subscribing is fire-and-forget.
function subscribeReactions(gameId: bigint) {
  const key = gameId.toString();
  if (subscribedGames.has(key)) return;
  subscribedGames.add(key);
  truapi.statements.subscribe<ReactionPayload>(
    (statement) => {
      const { e, ts } = statement.data ?? {};
      const rain = statement.data?.rain === true;
      if (typeof e !== "string" || typeof ts !== "number") return;
      if (!REACTION_EMOJIS.includes(e)) return;
      if (Date.now() - ts > REACTION_MAX_AGE_MS) return;
      if (locallyShown.delete(`${e}:${ts}:${rain}`)) return;   // own send already shown
      const dedupeKey = `${statement.signerHex ?? "?"}:${e}:${ts}:${rain}`;
      if (seen.has(dedupeKey)) return;
      seen.add(dedupeKey);
      emit(key, e, rain);
    },
    { topic2: reactionRoomForGame(gameId) },
  );
}

/** Show locally right away; broadcast best-effort (standalone stays local-only). */
export async function sendReaction(gameId: bigint, emoji: string, rain = false) {
  const ts = Date.now();
  emit(gameId.toString(), emoji, rain);
  if (!rain) {
    if (ts - lastSinglePublishAt < SINGLE_PUBLISH_MIN_INTERVAL_MS) return;
    lastSinglePublishAt = ts;
  }
  locallyShown.add(`${emoji}:${ts}:${rain}`);
  const payload: ReactionPayload = rain ? { e: emoji, ts, rain: true } : { e: emoji, ts };
  await truapi.statements.publish<ReactionPayload>(payload, {
    topic2: reactionRoomForGame(gameId),
    ttlSeconds: REACTION_TTL_SECONDS,
  });
}
