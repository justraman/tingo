import { useEffect, useRef, useState } from "react";
import { onReaction } from "@/lib/chat/reactions";

interface Drop {
  id: number;
  emoji: string;
  left: number;      // vw %
  size: number;      // rem
  duration: number;  // s
  delay: number;     // s
  drift: number;     // px of horizontal sway over the fall
}

const DROPS_PER_BURST = 14;
const BURST_LIFETIME_MS = 5000;

/** Full-viewport reaction rain; listens on the game's reaction room. */
export function EmojiRain({ gameId }: { gameId: bigint }) {
  const [drops, setDrops] = useState<Drop[]>([]);
  const nextId = useRef(0);

  useEffect(() => {
    return onReaction(gameId, (emoji) => {
      const burst: Drop[] = Array.from({ length: DROPS_PER_BURST }, () => ({
        id: nextId.current++,
        emoji,
        left: 2 + Math.random() * 96,
        size: 1.4 + Math.random() * 1.4,
        duration: 2.2 + Math.random() * 1.6,
        delay: Math.random() * 0.7,
        drift: (Math.random() - 0.5) * 120,
      }));
      setDrops((d) => [...d, ...burst]);
      const ids = new Set(burst.map((b) => b.id));
      setTimeout(() => setDrops((d) => d.filter((x) => !ids.has(x.id))), BURST_LIFETIME_MS);
    });
  }, [gameId]);

  if (drops.length === 0) return null;

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-40 overflow-hidden">
      {drops.map((d) => (
        <span
          key={d.id}
          className="emoji-drop"
          style={{
            left: `${d.left}%`,
            fontSize: `${d.size}rem`,
            animationDuration: `${d.duration}s`,
            animationDelay: `${d.delay}s`,
            "--drift": `${d.drift}px`,
          } as React.CSSProperties}
        >
          {d.emoji}
        </span>
      ))}
    </div>
  );
}
