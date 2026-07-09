import { useMemo } from "react";

interface Props {
  colors: string[];
  count?: number;
}

/** A one-shot fixed-layer confetti burst. Pieces are generated once on mount;
    CSS (`confetti-fall`) drives the drop and honors reduced-motion. */
export function Confetti({ colors, count = 90 }: Props) {
  const pieces = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        left: Math.random() * 100,
        delay: Math.random() * 0.6,
        duration: 1.9 + Math.random() * 1.7,
        size: 6 + Math.random() * 8,
        rotate: Math.random() * 360,
        color: colors[i % colors.length],
      })),
    [count, colors],
  );

  return (
    <div className="pointer-events-none fixed inset-0 z-[115] overflow-hidden" aria-hidden>
      {pieces.map((p, i) => (
        <span
          key={i}
          className="confetti-piece"
          style={{
            left: `${p.left}%`,
            width: `${p.size}px`,
            height: `${p.size * 1.6}px`,
            background: p.color,
            borderRadius: "2px",
            transform: `rotate(${p.rotate}deg)`,
            boxShadow: `0 0 8px ${p.color}66`,
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.duration}s`,
          }}
        />
      ))}
    </div>
  );
}
