import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";

interface Props {
  drawn: number[];
  latest?: number;
}

// One muted hue per decade (1–10, 11–20, …), matching the ticket-paper palette.
const BALL_HUES = [
  "14 58% 52%",  // terracotta
  "40 62% 50%",  // ochre
  "162 40% 44%", // jade
  "205 52% 52%", // steel
  "262 42% 56%", // amethyst
  "342 45% 54%", // rosewood
  "88 35% 46%",  // moss
  "22 52% 50%",  // clay
  "190 42% 46%", // teal
];

const ballHue = (n: number) => BALL_HUES[Math.min(Math.floor((n - 1) / 10), 8)];

export function NumberBoard({ drawn, latest }: Props) {
  const history = [...drawn].reverse();

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-5">
        <div key={latest ?? "none"} className={cn("relative h-24 w-24 shrink-0", latest !== undefined && "ripple-once")}>
          {latest !== undefined ? (
            <div
              className="draw-ball absolute inset-0 rounded-full"
              style={{ "--ball": ballHue(latest) } as CSSProperties}
            >
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="draw-ball-label font-game flex h-[52px] w-[52px] items-center justify-center rounded-full text-3xl font-bold tabular-nums">
                  <span className="animate-number-in">{latest}</span>
                </span>
              </div>
            </div>
          ) : (
            <>
              <div className="glass-strong absolute inset-0 rounded-full" />
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-2xl font-semibold text-white/25">–</span>
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
              className={cn(
                "font-game flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/[0.05] text-xs font-semibold tabular-nums text-foreground/85",
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
