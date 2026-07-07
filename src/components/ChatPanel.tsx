import { useEffect, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Send } from "lucide-react";
import { useChatStore, type ChatMessage } from "@/lib/store/chat";
import { attachChatSubscription, sendChat } from "@/lib/chat/manager";
import { shortenAddress } from "@/lib/utils";

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
      <CardHeader>
        <CardTitle className="text-lg">Chat {readonly && <span className="ml-2 text-sm text-muted-foreground">(closed)</span>}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-3 pt-0">
        <ScrollArea className="h-64 flex-1 rounded-md border bg-muted/30">
          <div ref={scrollerRef} className="flex flex-col gap-2 p-3">
            {messages.length === 0 && (
              <div className="text-xs text-muted-foreground">No messages yet — say hi!</div>
            )}
            {messages.map((m, i) => (
              <div key={i} className="text-sm">
                <span className="font-mono text-xs text-muted-foreground">{shortenAddress(m.from)}</span>
                <span className="ml-2">{m.text}</span>
              </div>
            ))}
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
          />
          <Button onClick={() => void send()} disabled={readonly || busy || !text.trim()}>
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
