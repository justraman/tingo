import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";
import { useVibe } from "@/lib/store/vibe";
import { cellHueStyle } from "@/lib/vibe-colors";

interface Props {
  drawn: number[];
  latest?: number;
}

// Underdamped springs so the drop overshoots and wobbles before settling.
const DROP_TRANSITION = {
  y: { type: "spring", stiffness: 340, damping: 17 } as const,
  scaleX: { type: "spring", stiffness: 210, damping: 6 } as const,
  scaleY: { type: "spring", stiffness: 210, damping: 6 } as const,
  opacity: { duration: 0.2 } as const,
};

export function NumberBoard({ drawn, latest }: Props) {
  const vibe = useVibe();
  const history = [...drawn].reverse();

  // Arcade juices each call with a brief screen-shake (CSS honors reduced-motion).
  const [shaking, setShaking] = useState(false);
  const prevLatest = useRef(latest);
  useEffect(() => {
    if (latest !== undefined && latest !== prevLatest.current && vibe === "arcade") {
      setShaking(true);
      const t = setTimeout(() => setShaking(false), 460);
      prevLatest.current = latest;
      return () => clearTimeout(t);
    }
    prevLatest.current = latest;
  }, [latest, vibe]);

  return (
    <div className={cn("flex flex-col gap-5", shaking && "animate-shake")}>
      <div className="flex items-center gap-5">
        <div key={latest ?? "none"} className={cn("relative h-24 w-24 shrink-0", latest !== undefined && "ripple-once")}>
          {latest !== undefined ? (
            <motion.div
              key={latest}
              className="absolute inset-0"
              style={cellHueStyle(vibe, latest)}
              initial={{ y: -30, scaleX: 0.75, scaleY: 1.25, opacity: 0 }}
              animate={{ y: 0, scaleX: 1, scaleY: 1, opacity: 1 }}
              transition={DROP_TRANSITION}
            >
              <div className="draw-ball absolute inset-0" />
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="draw-ball-number font-game text-3xl font-bold tabular-nums">
                  <span className="animate-number-in inline-block">{latest}</span>
                </span>
              </div>
            </motion.div>
          ) : (
            <>
              <div className="glass-strong absolute inset-0 rounded-full" />
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-2xl font-semibold text-[var(--ink-faint)]">–</span>
              </div>
            </>
          )}
        </div>
        <div>
          <div className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
            {latest !== undefined ? "Latest draw" : "Waiting for first draw"}
          </div>
          {drawn.length > 0 && (
            <div className="font-game mt-1 text-sm font-semibold tabular-nums text-foreground/70">
              {drawn.length} <span className="font-normal text-muted-foreground">of 90 drawn</span>
            </div>
          )}
        </div>
      </div>

      {history.length > 1 && (
        <div className="flex flex-wrap gap-1.5">
          {history.slice(1).map((n, i) => (
            <span
              key={n}
              style={vibe === "arcade" ? cellHueStyle(vibe, n) : undefined}
              className={cn(
                "font-game flex h-9 w-9 items-center justify-center rounded-full text-xs font-semibold tabular-nums",
                vibe === "arcade"
                  ? "cell-dab"
                  : "border border-[var(--line)] bg-[var(--fill)] text-foreground/85",
                i === 0 && "animate-fade",
              )}
            >
              {n}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
