import { useEffect, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Send, MessagesSquare, Pencil } from "lucide-react";
import { useChatStore, type ChatMessage } from "@/lib/store/chat";
import { attachChatSubscription, sendChat } from "@/lib/chat/manager";
import { onReaction, sendReaction } from "@/lib/chat/reactions";
import { readStoredUsername, writeStoredUsername } from "@/lib/chat/username";
import { getPrimaryUsername } from "@/lib/host/identity";
import { CHAT_NAME_MAX, REACTION_EMOJIS } from "@/lib/chat/protocol";
import { shortenAddress } from "@/lib/utils";
import { hueFromSeed } from "@/lib/ticket-hues";

interface Props {
  gameId: bigint;
  disabled?: boolean;       // game ended — read-only
}

// Stable fallback: `?? []` in a selector mints a fresh array every render,
// which useSyncExternalStore treats as an ever-changing snapshot (infinite loop).
const NO_MESSAGES: ChatMessage[] = [];

// Raining is earned, not free: 5 rapid presses of the same emoji trigger it,
// then the sender sits out a minute so one player can't flood the screen.
const RAIN_PRESS_THRESHOLD = 5;
const RAIN_PRESS_WINDOW_MS = 3000;
const RAIN_COOLDOWN_MS = 60_000;
const FLOAT_LIFETIME_MS = 3200;

interface FloatEmoji {
  id: number;
  emoji: string;
  left: number;      // % across the chat
  drift: number;     // px of horizontal sway while rising
  duration: number;  // s
  size: number;      // rem
}

function senderLabel(m: ChatMessage): string {
  return m.name ?? shortenAddress(m.from, 6, 4);
}

export function ChatPanel({ gameId, disabled }: Props) {
  const messages = useChatStore((s) => s.byId[gameId.toString()] ?? NO_MESSAGES);
  const isClosed = useChatStore((s) => s.closed[gameId.toString()] ?? false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  // undefined = still loading from storage, null = never chosen (gate the input)
  const [username, setUsername] = useState<string | null | undefined>(undefined);
  const [nameDraft, setNameDraft] = useState("");
  const [editingName, setEditingName] = useState(false);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const presses = useRef<{ emoji: string; ts: number }[]>([]);
  const [rainCooldownUntil, setRainCooldownUntil] = useState(0);
  const [floats, setFloats] = useState<FloatEmoji[]>([]);
  const nextFloatId = useRef(0);

  useEffect(() => {
    void attachChatSubscription(gameId);
  }, [gameId]);

  useEffect(() => {
    let cancel = false;
    (async () => {
      const stored = await readStoredUsername().catch(() => null);
      if (cancel) return;
      if (stored) { setUsername(stored); return; }
      setUsername(null);
      const suggested = await getPrimaryUsername().catch(() => null);
      if (!cancel && suggested) setNameDraft(suggested.slice(0, CHAT_NAME_MAX));
    })();
    return () => { cancel = true; };
  }, []);

  useEffect(() => {
    const viewport = scrollerRef.current?.closest<HTMLElement>("[data-radix-scroll-area-viewport]");
    viewport?.scrollTo({ top: viewport.scrollHeight, behavior: "smooth" });
  }, [messages.length]);

  useEffect(() => {
    if (!rainCooldownUntil) return;
    const t = setTimeout(() => setRainCooldownUntil(0), Math.max(0, rainCooldownUntil - Date.now()));
    return () => clearTimeout(t);
  }, [rainCooldownUntil]);

  useEffect(() => {
    return onReaction(gameId, (emoji, rain) => {
      if (rain) return;   // bursts rain full-screen via EmojiRain
      const id = nextFloatId.current++;
      setFloats((cur) => [...cur, {
        id,
        emoji,
        left: 8 + Math.random() * 80,
        drift: (Math.random() - 0.5) * 70,
        duration: 2.2 + Math.random() * 0.8,
        size: 1.3 + Math.random() * 0.6,
      }]);
      setTimeout(() => setFloats((cur) => cur.filter((f) => f.id !== id)), FLOAT_LIFETIME_MS);
    });
  }, [gameId]);

  const readonly = disabled || isClosed;
  const showNameForm = !readonly && username !== undefined && (username === null || editingName);

  async function saveName() {
    const name = nameDraft.trim().slice(0, CHAT_NAME_MAX);
    if (!name) return;
    try {
      await writeStoredUsername(name);
      setUsername(name);
      setEditingName(false);
    } catch (e) {
      console.error("saving chat name failed", e);
    }
  }

  async function send() {
    const trimmed = text.trim();
    if (!trimmed || readonly || !username) return;
    setBusy(true);
    try {
      await sendChat(gameId, trimmed);
      setText("");
    } catch (e) {
      console.error("chat send failed", e);
    } finally {
      setBusy(false);
    }
  }

  function react(emoji: string) {
    const now = Date.now();
    if (now < rainCooldownUntil) return;
    presses.current = [
      ...presses.current.filter((p) => now - p.ts < RAIN_PRESS_WINDOW_MS),
      { emoji, ts: now },
    ];
    const rain = presses.current.filter((p) => p.emoji === emoji).length >= RAIN_PRESS_THRESHOLD;
    if (rain) {
      presses.current = [];
      setRainCooldownUntil(now + RAIN_COOLDOWN_MS);
    }
    sendReaction(gameId, emoji, rain).catch((e) => console.error("reaction send failed", e));
  }

  return (
    <Card className="flex h-full flex-col">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <MessagesSquare className="h-5 w-5 text-muted-foreground" />
          Chat
          {readonly && <span className="text-sm font-normal text-muted-foreground">(closed)</span>}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col gap-3 pt-0">
        <div className="relative min-h-[20rem] flex-1">
          <ScrollArea className="glass-inset h-full rounded-2xl">
            <div ref={scrollerRef} className="flex flex-col gap-3 p-4">
              {messages.length === 0 && (
                <div className="py-10 text-center text-sm text-muted-foreground">No messages yet — say hi!</div>
              )}
              {messages.map((m, i) => {
                const hue = hueFromSeed(m.from).hsl;
                const sameSender = i > 0 && messages[i - 1].from === m.from;
                return (
                  <div key={i} className={sameSender ? "-mt-1.5" : undefined}>
                    {!sameSender && (
                      <div className="mb-0.5 flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded-full" style={{ background: `hsl(${hue})` }} />
                        <span className="text-xs font-semibold" style={{ color: `hsl(${hue})` }}>
                          {senderLabel(m)}
                        </span>
                      </div>
                    )}
                    <div className="animate-fade break-words pl-3.5 text-[15px] leading-relaxed text-foreground/90">
                      {m.text}
                    </div>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
          {floats.length > 0 && (
            <div aria-hidden className="pointer-events-none absolute inset-0 z-10 overflow-hidden rounded-2xl">
              {floats.map((f) => (
                <span
                  key={f.id}
                  className="emoji-float"
                  style={{
                    left: `${f.left}%`,
                    fontSize: `${f.size}rem`,
                    animationDuration: `${f.duration}s`,
                    "--drift": `${f.drift}px`,
                  } as React.CSSProperties}
                >
                  {f.emoji}
                </span>
              ))}
            </div>
          )}
        </div>

        {showNameForm ? (
          <div className="glass-inset animate-fade rounded-2xl p-3">
            <div className="mb-2 text-xs text-muted-foreground">
              Pick a name to chat as — other players will see it.
            </div>
            <div className="flex gap-2">
              <Input
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                maxLength={CHAT_NAME_MAX}
                placeholder="Your name"
                onKeyDown={(e) => { if (e.key === "Enter") void saveName(); }}
                className="h-10 rounded-full"
                autoFocus
              />
              <Button
                className="h-10 shrink-0 rounded-full px-4"
                onClick={() => void saveName()}
                disabled={!nameDraft.trim()}
              >
                {username === null ? "Join chat" : "Save"}
              </Button>
              {editingName && username !== null && (
                <Button
                  variant="ghost"
                  className="h-10 shrink-0 rounded-full px-3"
                  onClick={() => { setEditingName(false); setNameDraft(username); }}
                >
                  Cancel
                </Button>
              )}
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {!readonly && (
              <div className="flex items-center justify-between px-1">
                <div className="flex gap-0.5">
                  {REACTION_EMOJIS.map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      onClick={() => react(emoji)}
                      disabled={rainCooldownUntil > 0}
                      aria-label={`React with ${emoji}`}
                      title={rainCooldownUntil > 0 ? "Too much raining — back in a minute" : "Tap to react — 5× fast makes it rain"}
                      className="cursor-pointer rounded-full px-1.5 py-0.5 text-lg transition-transform duration-150 hover:scale-125 active:scale-90 disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:scale-100"
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
                {username && (
                  <button
                    type="button"
                    onClick={() => { setNameDraft(username); setEditingName(true); }}
                    className="flex cursor-pointer items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
                  >
                    as <span className="font-medium">{username}</span>
                    <Pencil className="h-3 w-3" />
                  </button>
                )}
              </div>
            )}
            <div className="flex gap-2">
              <Input
                value={text}
                onChange={(e) => setText(e.target.value)}
                maxLength={240} /* statements cap the payload at 512 bytes */
                disabled={readonly || busy || !username}
                placeholder={readonly ? "Chat ended" : "Type a message…"}
                onKeyDown={(e) => { if (e.key === "Enter") void send(); }}
                className="h-12 rounded-full"
              />
              <Button
                size="icon"
                variant="secondary"
                className="h-12 w-12 shrink-0"
                onClick={() => void send()}
                disabled={readonly || busy || !text.trim() || !username}
                aria-label="Send message"
              >
                <Send className="h-5 w-5" />
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
