import { Trophy, CircleDot } from "lucide-react";
import { shortenAddress, formatPlanck } from "@/lib/utils";
import { CHAIN } from "@/lib/chain/constants";

interface Props {
  topLine?: { winner: `0x${string}`; payout: bigint };
  middleLine?: { winner: `0x${string}`; payout: bigint };
  bottomLine?: { winner: `0x${string}`; payout: bigint };
  fullhouse?: { winner: `0x${string}`; payout: bigint; host?: `0x${string}`; hostFee?: bigint };
}

const lineLabels = ["Top line", "Middle line", "Bottom line"];
const lineHues = ["347 89% 61%", "38 95% 56%", "199 92% 56%"];

export function WinnerBanner({ topLine, middleLine, bottomLine, fullhouse }: Props) {
  const lines = [topLine, middleLine, bottomLine];
  const anything = lines.some(Boolean) || fullhouse;
  if (!anything) return null;

  return (
    <div className="animate-rise ticket-sheen relative overflow-hidden rounded-3xl border border-amber-300/25 bg-[linear-gradient(135deg,hsl(42_90%_55%/0.14),hsl(42_90%_55%/0.04)_60%)] p-5 backdrop-blur-2xl shadow-[0_8px_32px_hsl(42_90%_50%/0.12),inset_0_1px_0_hsl(0_0%_100%/0.12)]">
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
              <span className="font-mono text-foreground/90">{shortenAddress(l.winner)}</span>
              <span className="text-muted-foreground">won {formatPlanck(l.payout, CHAIN.decimals, CHAIN.symbol)}</span>
            </div>
          ) : null,
        )}
        {fullhouse && (
          <div className={lines.some(Boolean) ? "mt-2 border-t border-white/10 pt-3" : ""}>
            <div className="flex items-center gap-3">
              <span className="animate-glow flex h-11 w-11 items-center justify-center rounded-full bg-[radial-gradient(circle_at_35%_30%,hsl(48_100%_70%),hsl(38_95%_50%))] shadow-[inset_0_1px_0_hsl(0_0%_100%/0.5)]">
                <Trophy className="h-5 w-5 text-amber-950" />
              </span>
              <div>
                <div className="text-base font-semibold leading-tight">
                  Full house — <span className="font-mono">{shortenAddress(fullhouse.winner)}</span>
                  <span className="ml-2 text-amber-300">{formatPlanck(fullhouse.payout, CHAIN.decimals, CHAIN.symbol)}</span>
                </div>
                {fullhouse.host && fullhouse.hostFee !== undefined && (
                  <div className="text-xs text-muted-foreground">
                    Host {shortenAddress(fullhouse.host)} earned {formatPlanck(fullhouse.hostFee, CHAIN.decimals, CHAIN.symbol)}
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
