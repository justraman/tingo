import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";
import { hueFromGrid, type TicketHue } from "@/lib/ticket-hues";
import { useVibe, type Vibe } from "@/lib/store/vibe";
import { cellHueStyle } from "@/lib/vibe-colors";

export interface TicketOverlay {
  label: string;
  kind: "line" | "fullhouse";
}

function OverlayBadge({ overlay, size }: { overlay: TicketOverlay; size: "sm" | "md" }) {
  return (
    <span
      className={cn(
        "whitespace-nowrap rounded-full border font-bold uppercase tracking-widest backdrop-blur-md",
        size === "sm" ? "px-2 py-0.5 text-[9px]" : "px-3 py-1 text-[11px]",
        overlay.kind === "fullhouse"
          ? "fullhouse-badge border-[hsl(var(--gold)/0.6)] bg-[hsl(var(--gold)/0.15)] text-[hsl(var(--gold))]"
          : "border-[var(--line-strong)] bg-[var(--fill-strong)] text-foreground/90",
      )}
    >
      {overlay.label}
    </span>
  );
}

interface Props {
  grid: number[][];                 // 3 rows × 9 cols, 0 = empty
  polledNumbers?: number[];         // numbers already drawn — dab them
  highlightRow?: number;            // live game: gold ring on the row that won (0/1/2)
  struckRows?: number[];            // ended game: strike through the winning lines
  overlay?: TicketOverlay[];        // one winner badge per title, stacked
  overlayMode?: "cover" | "ribbon"; // cover dims the whole ticket (ended); ribbon keeps it playable (live)
  size?: "sm" | "md";
  hue?: TicketHue;                  // defaults to a deterministic hue from the grid
  vibe?: Vibe;                      // override the active vibe (used by the vibe-preview cards)
}

export function TicketGrid({ grid, polledNumbers = [], highlightRow, struckRows, overlay, overlayMode = "cover", size = "md", hue, vibe: vibeProp }: Props) {
  const activeVibe = useVibe();
  const vibe = vibeProp ?? activeVibe;
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
                  style={isDabbed ? cellHueStyle(vibe, v) : undefined}
                  className={cn(
                    "cell",
                    cellBase,
                    v === 0
                      ? "cell-empty"
                      : isDabbed
                        ? cn("cell-dab dab-in", v === latest && "ring-1 ring-[var(--cell-ring)]")
                        : "cell-open",
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
      {overlay && overlay.length > 0 && (overlayMode === "cover" ? (
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center rounded-[inherit] bg-[var(--scrim)] backdrop-blur-[1.5px]">
          <div className={cn("flex -rotate-6 flex-col items-center", size === "sm" ? "gap-0.5" : "gap-1")}>
            {overlay.map((o) => (
              <OverlayBadge key={o.label} overlay={o} size={size} />
            ))}
          </div>
        </div>
      ) : (
        <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex -translate-y-1/2 flex-wrap items-center justify-center gap-1">
          {overlay.map((o) => (
            <OverlayBadge key={o.label} overlay={o} size={size} />
          ))}
        </div>
      ))}
    </div>
  );
}
