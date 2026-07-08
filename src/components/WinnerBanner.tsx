import { Trophy, CircleDot } from "lucide-react";
import { displayAddress, formatPlanck } from "@/lib/utils";
import { CHAIN } from "@/lib/chain/constants";

interface Props {
  topLine?: { winner: `0x${string}`; payout: bigint };
  middleLine?: { winner: `0x${string}`; payout: bigint };
  bottomLine?: { winner: `0x${string}`; payout: bigint };
  fullhouse?: { winner: `0x${string}`; payout: bigint; host?: `0x${string}`; hostFee?: bigint };
}

const lineLabels = ["Top line", "Middle line", "Bottom line"];
const lineHues = ["14 58% 60%", "40 62% 58%", "205 52% 60%"];

export function WinnerBanner({ topLine, middleLine, bottomLine, fullhouse }: Props) {
  const lines = [topLine, middleLine, bottomLine];
  const anything = lines.some(Boolean) || fullhouse;
  if (!anything) return null;

  return (
    <div className="animate-rise rounded-3xl border border-[hsl(var(--gold)/0.2)] bg-[hsl(var(--gold)/0.05)] p-5 backdrop-blur-2xl shadow-[0_12px_36px_hsl(240_60%_1%/0.6),inset_0_1px_0_hsl(0_0%_100%/0.08)]">
      <div className="flex flex-col gap-2.5">
        {lines.map((l, i) =>
          l ? (
            <div key={i} className="flex items-center gap-3 text-sm">
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
              </span>
              <span className="font-mono text-foreground/90">{displayAddress(l.winner)}</span>
              <span className="text-muted-foreground">won {formatPlanck(l.payout, CHAIN.decimals, CHAIN.symbol)}</span>
            </div>
          ) : null,
        )}
        {fullhouse && (
          <div className={lines.some(Boolean) ? "mt-2 border-t border-white/10 pt-3" : ""}>
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-full border border-[hsl(var(--gold)/0.45)] bg-[hsl(var(--gold)/0.12)]">
                <Trophy className="h-5 w-5 text-[hsl(var(--gold))]" />
              </span>
              <div>
                <div className="text-base font-semibold leading-tight">
                  Full house — <span className="font-mono">{displayAddress(fullhouse.winner)}</span>
                  <span className="ml-2 text-[hsl(var(--gold))]">{formatPlanck(fullhouse.payout, CHAIN.decimals, CHAIN.symbol)}</span>
                </div>
                {fullhouse.host && fullhouse.hostFee !== undefined && (
                  <div className="text-xs text-muted-foreground">
                    Host {displayAddress(fullhouse.host)} earned {formatPlanck(fullhouse.hostFee, CHAIN.decimals, CHAIN.symbol)}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
