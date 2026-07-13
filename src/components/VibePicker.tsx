import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { VIBES, VIBE_META, useVibeStore } from "@/lib/store/vibe";

const ACCENTS = ["--brand", "--spark", "--gold"] as const;

/** Each swatch scopes its own data-vibe, so it previews the vibe's real page
    color, display font and accent colors — making the three visibly distinct. */
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
          return (
            <button
              key={v}
              type="button"
              onClick={() => setVibe(v)}
              aria-pressed={active}
              className={cn(
                "group relative flex cursor-pointer flex-col items-center gap-1.5 rounded-xl border p-2 transition-colors",
                active ? "border-[var(--line-strong)] bg-[var(--fill)]" : "border-[var(--line)] hover:bg-[var(--fill)]",
              )}
            >
              <span
                data-vibe={v}
                className="font-display relative flex h-10 w-full items-center justify-center gap-1.5 overflow-hidden rounded-lg text-xs"
                style={{ background: "hsl(var(--background))", color: "hsl(var(--foreground))" }}
              >
                <span>Aa</span>
                <span className="flex gap-1">
                  {ACCENTS.map((t) => (
                    <span key={t} className="h-1.5 w-1.5 rounded-full" style={{ background: `hsl(var(${t}))`, boxShadow: `0 0 5px hsl(var(${t}))` }} />
                  ))}
                </span>
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
