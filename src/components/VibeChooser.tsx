import { TicketGrid } from "@/components/TicketGrid";
import { VIBES, VIBE_META, useVibeStore, type Vibe } from "@/lib/store/vibe";
import { cellHueStyle } from "@/lib/vibe-colors";

// A number spread across decades so Arcade's per-decade colors show off.
const PREVIEW_GRID = [
  [0, 12, 0, 34, 0, 0, 61, 0, 83],
  [4, 0, 27, 0, 45, 0, 0, 74, 0],
  [0, 18, 0, 0, 52, 0, 68, 0, 90],
];
const PREVIEW_DRAWN = [12, 34, 61, 27, 45, 18, 52];
const PREVIEW_LATEST = 45;

function MiniBall({ vibe, n }: { vibe: Vibe; n: number }) {
  return (
    <div className="relative h-12 w-12 shrink-0">
      <div className="draw-ball absolute inset-0 rounded-full" style={cellHueStyle(vibe, n)} />
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="draw-ball-number font-game text-lg font-bold tabular-nums">{n}</span>
      </div>
    </div>
  );
}

/** First-run overlay: shown once storage is read and no vibe was ever chosen.
    Each card scopes `data-vibe` to itself, so the three looks render at once. */
export function VibeChooser() {
  const hydrated = useVibeStore((s) => s.hydrated);
  const chosen = useVibeStore((s) => s.chosen);
  const setVibe = useVibeStore((s) => s.setVibe);

  if (!hydrated || chosen) return null;

  return (
    <div className="animate-fade fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-[hsl(240_10%_2%/0.82)] p-4 backdrop-blur-md sm:p-8">
      <div className="animate-rise w-full max-w-5xl">
        <div className="mb-6 text-center sm:mb-8">
          <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">Pick your vibe</h1>
          <p className="mt-1.5 text-sm text-white/60">
            Choose the look of your table — you can change it anytime from the menu.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          {VIBES.map((v) => (
            <div
              key={v}
              data-vibe={v}
              onClick={() => setVibe(v)}
              className="font-body flex cursor-pointer flex-col items-center gap-4 rounded-3xl border p-5 text-center transition-transform hover:-translate-y-1"
              style={{ background: "hsl(var(--background))", borderColor: "var(--line-strong)", color: "hsl(var(--foreground))" }}
            >
              <div className="flex w-full items-center justify-between gap-3">
                <div className="text-left">
                  <div className="font-display text-xl font-bold">{VIBE_META[v].label}</div>
                  <div className="text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>{VIBE_META[v].blurb}</div>
                </div>
                <MiniBall vibe={v} n={PREVIEW_LATEST} />
              </div>

              <TicketGrid grid={PREVIEW_GRID} polledNumbers={PREVIEW_DRAWN} vibe={v} size="sm" />

              <button
                type="button"
                onClick={() => setVibe(v)}
                className="font-display mt-1 inline-flex h-9 w-full items-center justify-center rounded-full text-sm font-semibold"
                style={{ background: "hsl(var(--brand))", color: "hsl(var(--brand-foreground))" }}
              >
                Use {VIBE_META[v].label}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
