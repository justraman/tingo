import { useEffect, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Send, MessagesSquare } from "lucide-react";
import { useChatStore, type ChatMessage } from "@/lib/store/chat";
import { attachChatSubscription, sendChat } from "@/lib/chat/manager";
import { shortenAddress } from "@/lib/utils";
import { hueFromSeed } from "@/lib/ticket-hues";

interface Props {
  gameId: bigint;
  disabled?: boolean;       // game ended — read-only
}

// Stable fallback: `?? []` in a selector mints a fresh array every render,
// which useSyncExternalStore treats as an ever-changing snapshot (infinite loop).
const NO_MESSAGES: ChatMessage[] = [];

export function ChatPanel({ gameId, disabled }: Props) {
  const messages = useChatStore((s) => s.byId[gameId.toString()] ?? NO_MESSAGES);
  const isClosed = useChatStore((s) => s.closed[gameId.toString()] ?? false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const scrollerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void attachChatSubscription(gameId);
  }, [gameId]);

  useEffect(() => {
    scrollerRef.current?.scrollTo({ top: scrollerRef.current.scrollHeight });
  }, [messages.length]);

  const readonly = disabled || isClosed;

  async function send() {
    const trimmed = text.trim();
    if (!trimmed || readonly) return;
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

  return (
    <Card className="flex h-full flex-col">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <MessagesSquare className="h-5 w-5 text-muted-foreground" />
          Chat
          {readonly && <span className="text-sm font-normal text-muted-foreground">(closed)</span>}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-3 pt-0">
        <ScrollArea className="glass-inset h-64 flex-1 rounded-2xl">
          <div ref={scrollerRef} className="flex flex-col gap-2.5 p-3">
            {messages.length === 0 && (
              <div className="py-6 text-center text-xs text-muted-foreground">No messages yet — say hi!</div>
            )}
            {messages.map((m, i) => {
              const hue = hueFromSeed(m.from).hsl;
              return (
                <div key={i} className="animate-rise flex items-baseline gap-2 text-sm">
                  <span
                    className="mt-1 h-2 w-2 shrink-0 self-center rounded-full"
                    style={{ background: `hsl(${hue})`, boxShadow: `0 0 8px hsl(${hue} / 0.6)` }}
                  />
                  <span className="font-mono text-xs" style={{ color: `hsl(${hue})` }}>
                    {shortenAddress(m.from)}
                  </span>
                  <span className="min-w-0 break-words text-foreground/90">{m.text}</span>
                </div>
              );
            })}
          </div>
        </ScrollArea>
        <div className="flex gap-2">
          <Input
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={240} /* statements cap the payload at 512 bytes */
            disabled={readonly || busy}
            placeholder={readonly ? "Chat ended" : "Type a message…"}
            onKeyDown={(e) => { if (e.key === "Enter") void send(); }}
            className="rounded-full"
          />
          <Button
            size="icon"
            variant="secondary"
            onClick={() => void send()}
            disabled={readonly || busy || !text.trim()}
            aria-label="Send message"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
