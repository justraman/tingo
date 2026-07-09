import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/utils";
import { hueFromGrid, TICKET_HUES, type TicketHue } from "@/lib/ticket-hues";
import { useVibe, type Vibe } from "@/lib/store/vibe";
import { ticketHue } from "@/lib/vibe-colors";

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
  title?: ReactNode;               // in-frame header, left (e.g. "Ticket A")
  subtitle?: ReactNode;            // in-frame header, right (e.g. short hash / owner)
}

export function TicketGrid({ grid, polledNumbers = [], highlightRow, struckRows, overlay, overlayMode = "cover", size = "md", hue, vibe: vibeProp, title, subtitle }: Props) {
  const activeVibe = useVibe();
  const vibe = vibeProp ?? activeVibe;
  const baseHue = hue ?? hueFromGrid(grid);
  const th = ticketHue(vibe, baseHue.hsl, Math.max(0, TICKET_HUES.indexOf(baseHue)));
  // Vintage tickets sit on the table at a slight, stable tilt.
  const tilt = vibe === "vintage" ? (grid.flat().reduce((a, n) => a + n, 0) % 2 ? 0.8 : -0.8) : 0;

  const titleStyle: CSSProperties | undefined = vibe === "arcade" ? { color: `hsl(${th})` } : undefined;
  const titleClass = cn(
    size === "sm" ? "text-[10px]" : "text-xs",
    vibe === "vintage"
      ? "font-game uppercase tracking-[0.18em] text-muted-foreground"
      : "font-display font-bold tracking-tight",
  );
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
      style={{ "--th": th, transform: tilt ? `rotate(${tilt}deg)` : undefined } as CSSProperties}
      className={cn(
        "glass ticket-surface relative inline-block",
        size === "sm" ? "rounded-xl p-1.5" : "rounded-2xl p-2",
        wonFullhouse && "fullhouse-win",
      )}
    >
      {(title || subtitle) && (
        <div className={cn("flex items-center justify-between gap-2 px-0.5", size === "sm" ? "mb-1.5" : "mb-2")}>
          {title && <span className={titleClass} style={titleStyle}>{title}</span>}
          {subtitle && (
            <span className="max-w-[55%] truncate text-right font-mono text-[10px] text-muted-foreground">{subtitle}</span>
          )}
        </div>
      )}
      <div className="flex flex-col gap-0.5">
        {grid.map((row, r) => (
          <div key={r} className={cn("relative flex gap-0.5 p-0.5", highlightRow === r && "row-win")}>
            {row.map((v, c) => {
              const isDabbed = v !== 0 && polled.has(v);
              return (
                <div
                  key={c}
                  className={cn(
                    "cell",
                    cellBase,
                    v === 0
                      ? "cell-empty"
                      : isDabbed
                        ? cn("cell-dab dab-in", v === latest && "cell-latest")
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
