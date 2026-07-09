import { Trophy, CircleDot } from "lucide-react";
import { formatPlanck } from "@/lib/utils";
import { AddressLabel } from "@/components/AddressLabel";
import { CHAIN } from "@/lib/chain/constants";
import type { FullhousePrize, LinePrize } from "@/lib/tambola/prize";

interface Props {
  topLine: LinePrize[];
  middleLine: LinePrize[];
  bottomLine: LinePrize[];
  fullhouse: FullhousePrize[];
}

const lineLabels = ["Top line", "Middle line", "Bottom line"];
const lineHues = ["14 58% 60%", "40 62% 58%", "205 52% 60%"];

export function WinnerBanner({ topLine, middleLine, bottomLine, fullhouse }: Props) {
  const lines = [topLine, middleLine, bottomLine];
  const anyLine = lines.some((l) => l.length > 0);
  if (!anyLine && fullhouse.length === 0) return null;

  return (
    <div className="animate-rise rounded-3xl border border-[hsl(var(--gold)/0.2)] bg-[hsl(var(--gold)/0.05)] p-5 backdrop-blur-2xl shadow-[0_12px_36px_hsl(240_60%_1%/0.6),inset_0_1px_0_hsl(var(--foreground)/0.08)]">
      <div className="flex flex-col gap-2.5">
        {lines.map((winners, i) =>
          winners.length > 0 ? (
            <div key={i} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
              <span
                className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold"
                style={{
                  borderColor: `hsl(${lineHues[i]} / 0.4)`,
                  background: `hsl(${lineHues[i]} / 0.15)`,
                  color: `hsl(${lineHues[i]})`,
                }}
              >
                <CircleDot className="h-3 w-3" />
                {lineLabels[i]}
                {winners.length > 1 && " (split)"}
              </span>
              {winners.map((w, j) => (
                <span key={j} className="flex items-center gap-1.5">
                  <span className="font-mono text-foreground/90"><AddressLabel address={w.winner} /></span>
                  <span className="text-muted-foreground">won {formatPlanck(w.payout, CHAIN.decimals, CHAIN.symbol)}</span>
                </span>
              ))}
            </div>
          ) : null,
        )}
        {fullhouse.length > 0 && (
          <div className={anyLine ? "mt-2 border-t border-[var(--line)] pt-3" : ""}>
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-full border border-[hsl(var(--gold)/0.45)] bg-[hsl(var(--gold)/0.12)]">
                <Trophy className="h-5 w-5 text-[hsl(var(--gold))]" />
              </span>
              <div>
                {fullhouse.map((w, i) => (
                  <div key={i} className="text-base font-semibold leading-tight">
                    Full house{fullhouse.length > 1 ? " (split)" : ""} —{" "}
                    <span className="font-mono"><AddressLabel address={w.winner} /></span>
                    <span className="ml-2 text-[hsl(var(--gold))]">{formatPlanck(w.payout, CHAIN.decimals, CHAIN.symbol)}</span>
                  </div>
                ))}
                <div className="text-xs text-muted-foreground">
                  Host <AddressLabel address={fullhouse[0].host} /> earned {formatPlanck(fullhouse[0].hostFee, CHAIN.decimals, CHAIN.symbol)}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
