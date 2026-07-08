import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";
import { hueFromGrid, type TicketHue } from "@/lib/ticket-hues";

export interface TicketOverlay {
  label: string;
  kind: "line" | "fullhouse";
}

interface Props {
  grid: number[][];                 // 3 rows × 9 cols, 0 = empty
  polledNumbers?: number[];         // numbers already drawn — dab them
  highlightRow?: number;            // live game: gold ring on the row that won (0/1/2)
  struckRows?: number[];            // ended game: strike through the winning lines
  overlay?: TicketOverlay[];        // ended game: one winner badge per title, stacked
  size?: "sm" | "md";
  hue?: TicketHue;                  // defaults to a deterministic hue from the grid
}

export function TicketGrid({ grid, polledNumbers = [], highlightRow, struckRows, overlay, size = "md", hue }: Props) {
  const th = (hue ?? hueFromGrid(grid)).hsl;
  const polled = new Set(polledNumbers);
  const struck = new Set(struckRows ?? []);
  const latest = polledNumbers[polledNumbers.length - 1];
  const wonFullhouse = overlay?.some((o) => o.kind === "fullhouse") ?? false;
  const cellBase =
    size === "sm"
      ? "h-7 w-7 text-xs rounded-md"
      : "h-10 w-10 sm:h-12 sm:w-12 text-sm sm:text-base rounded-lg";

  return (
    <div
      style={{ "--th": th } as CSSProperties}
      className={cn(
        "glass relative inline-block",
        size === "sm" ? "rounded-xl p-1.5" : "rounded-2xl p-2",
        wonFullhouse && "fullhouse-win",
      )}
    >
      <div className="flex flex-col gap-0.5">
        {grid.map((row, r) => (
          <div key={r} className={cn("relative flex gap-0.5 p-0.5", highlightRow === r && "row-win")}>
            {row.map((v, c) => {
              const isDabbed = v !== 0 && polled.has(v);
              return (
                <div
                  key={c}
                  className={cn(
                    "font-game flex items-center justify-center font-bold tabular-nums",
                    cellBase,
                    v === 0
                      ? "bg-white/[0.03]"
                      : isDabbed
                        ? cn(
                            "dab-in bg-[hsl(var(--th)/0.9)] text-black/75",
                            v === latest && "ring-1 ring-white/60",
                          )
                        : "bg-white/[0.06] text-foreground/90",
                  )}
                >
                  {v === 0 ? "" : v}
                </div>
              );
            })}
            {struck.has(r) && (
              <span className="pointer-events-none absolute left-1 right-1 top-1/2 z-10 h-[2px] -translate-y-1/2 rounded-full bg-[hsl(var(--gold)/0.85)] shadow-[0_0_8px_hsl(var(--gold)/0.55)]" />
            )}
          </div>
        ))}
      </div>
      {overlay && overlay.length > 0 && (
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center rounded-[inherit] bg-black/40 backdrop-blur-[1.5px]">
          <div className={cn("flex -rotate-6 flex-col items-center", size === "sm" ? "gap-0.5" : "gap-1")}>
            {overlay.map((o) => (
              <span
                key={o.label}
                className={cn(
                  "whitespace-nowrap rounded-full border font-bold uppercase tracking-widest backdrop-blur-md",
                  size === "sm" ? "px-2 py-0.5 text-[9px]" : "px-3 py-1 text-[11px]",
                  o.kind === "fullhouse"
                    ? "fullhouse-badge border-[hsl(var(--gold)/0.6)] bg-[hsl(var(--gold)/0.15)] text-[hsl(var(--gold))]"
                    : "border-white/25 bg-white/10 text-foreground/90",
                )}
              >
                {o.label}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
