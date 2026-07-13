import { useVibe } from "@/lib/store/vibe";
import type { PrizeBps } from "@/lib/tambola/read";

interface Props { shares: PrizeBps; }

const ARCADE_COLORS = ["19 100% 62%", "46 100% 60%", "188 100% 57%", "268 100% 71%", "251 20% 55%"];
const VINTAGE_COLORS = ["11 56% 51%", "39 67% 55%", "125 17% 37%", "20 30% 42%", "40 22% 62%"];

const pct = (bps: number) => (bps % 100 === 0 ? bps / 100 : bps / 100);

/** Stacked prize-split bar + legend for the arcade/vintage game rail. */
export function PrizeSplit({ shares }: Props) {
  const vibe = useVibe();
  const colors = vibe === "vintage" ? VINTAGE_COLORS : ARCADE_COLORS;
  const segments = [
    { label: "Top line", bps: shares.lineBps },
    { label: "Middle line", bps: shares.lineBps },
    { label: "Bottom line", bps: shares.lineBps },
    { label: "Full house", bps: shares.fullhouseBps },
    { label: "Host", bps: shares.hostBps },
  ].map((s, i) => ({ ...s, color: `hsl(${colors[i]})`, share: pct(s.bps) }));

  return (
    <div className="glass rounded-2xl p-4">
      <div className="font-display mb-3 text-sm font-bold">Prize split</div>
      <div className="mb-3 flex h-3 overflow-hidden rounded-full border border-[var(--line)]">
        {segments.map((s, i) => (
          <div key={i} style={{ width: `${s.share}%`, background: s.color }} />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1.5 text-[11px] text-muted-foreground">
        {segments.map((s, i) => (
          <span key={i} className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: s.color }} />
            {s.label} <b className="text-foreground">{s.share}%</b>
          </span>
        ))}
      </div>
    </div>
  );
}
