import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";
import { hueFromGrid, type TicketHue } from "@/lib/ticket-hues";

interface Props {
  grid: number[][];                 // 3 rows × 9 cols, 0 = empty
  polledNumbers?: number[];         // numbers already drawn — dab them
  highlightRow?: number;            // the row that won (0/1/2)
  size?: "sm" | "md";
  hue?: TicketHue;                  // defaults to a deterministic hue from the grid
}

export function TicketGrid({ grid, polledNumbers = [], highlightRow, size = "md", hue }: Props) {
  const th = (hue ?? hueFromGrid(grid)).hsl;
  const polled = new Set(polledNumbers);
  const latest = polledNumbers[polledNumbers.length - 1];
  const cellBase =
    size === "sm"
      ? "h-7 w-7 text-xs rounded-md"
      : "h-10 w-10 sm:h-12 sm:w-12 text-sm sm:text-base rounded-lg";

  return (
    <div
      style={{ "--th": th } as CSSProperties}
      className={cn(
        "ticket-sheen relative inline-block overflow-hidden backdrop-blur-2xl",
        "border border-[hsl(var(--th)/0.35)] shadow-[0_8px_32px_hsl(var(--th)/0.15),inset_0_1px_0_hsl(0_0%_100%/0.15)]",
        size === "sm" ? "rounded-xl p-1.5" : "rounded-2xl p-2",
      )}
    >
      <div
        aria-hidden
        className="absolute inset-0 bg-[linear-gradient(135deg,hsl(var(--th)/0.25),hsl(var(--th)/0.07)_55%,hsl(var(--th)/0.16))]"
      />
      <div className="relative flex flex-col gap-0.5">
        {grid.map((row, r) => (
          <div key={r} className={cn("flex gap-0.5 p-0.5", highlightRow === r && "row-win")}>
            {row.map((v, c) => {
              const isDabbed = v !== 0 && polled.has(v);
              return (
                <div
                  key={c}
                  style={isDabbed ? ({ "--dab-tilt": `${(v % 7) - 3}deg` } as CSSProperties) : undefined}
                  className={cn(
                    "font-game flex items-center justify-center font-bold tabular-nums",
                    cellBase,
                    v === 0
                      ? "bg-white/[0.04]"
                      : isDabbed
                        ? cn(
                            "dab-in bg-[hsl(var(--th))] text-black/80 shadow-[0_0_14px_hsl(var(--th)/0.55),inset_0_1px_0_hsl(0_0%_100%/0.45)]",
                            v === latest && "ring-2 ring-white/70",
                          )
                        : "bg-white/[0.09] text-white shadow-[inset_0_1px_0_hsl(0_0%_100%/0.1)]",
                  )}
                >
                  {v === 0 ? "" : v}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
