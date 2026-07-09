import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { VIBES, VIBE_META, useVibeStore, type Vibe } from "@/lib/store/vibe";

/** A miniature of each vibe: its page color plus its three signature accents,
    so the choice reads visually before it's applied. */
const SWATCH: Record<Vibe, { bg: string; dots: [string, string, string] }> = {
  glass:   { bg: "hsl(240 10% 4%)",  dots: ["hsl(14 58% 60%)", "hsl(40 62% 58%)", "hsl(205 52% 60%)"] },
  arcade:  { bg: "hsl(253 43% 5%)",  dots: ["hsl(338 100% 59%)", "hsl(188 100% 57%)", "hsl(46 100% 60%)"] },
  vintage: { bg: "hsl(43 55% 90%)",  dots: ["hsl(11 56% 51%)", "hsl(125 17% 37%)", "hsl(39 67% 55%)"] },
};

export function VibePicker() {
  const vibe = useVibeStore((s) => s.vibe);
  const setVibe = useVibeStore((s) => s.setVibe);

  return (
    <div>
      <div className="mb-1.5 text-[11px] font-medium uppercase tracking-widest text-muted-foreground">
        Appearance
      </div>
      <div className="grid grid-cols-3 gap-2">
        {VIBES.map((v) => {
          const active = v === vibe;
          const s = SWATCH[v];
          return (
            <button
              key={v}
              type="button"
              onClick={() => setVibe(v)}
              aria-pressed={active}
              className={cn(
                "group relative flex cursor-pointer flex-col items-center gap-1.5 rounded-xl border p-2 transition-colors",
                active
                  ? "border-[var(--line-strong)] bg-[var(--fill)]"
                  : "border-[var(--line)] hover:bg-[var(--fill)]",
              )}
            >
              <span
                className="relative flex h-9 w-full items-center justify-center gap-1 overflow-hidden rounded-lg"
                style={{ background: s.bg }}
              >
                {s.dots.map((c, i) => (
                  <span key={i} className="h-2 w-2 rounded-full" style={{ background: c, boxShadow: `0 0 6px ${c}` }} />
                ))}
                {active && (
                  <span className="absolute right-1 top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-[hsl(var(--brand))]">
                    <Check className="h-2.5 w-2.5 text-[hsl(var(--brand-foreground))]" strokeWidth={3} />
                  </span>
                )}
              </span>
              <span className={cn("text-[11px] font-semibold", active ? "text-foreground" : "text-muted-foreground")}>
                {VIBE_META[v].label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
