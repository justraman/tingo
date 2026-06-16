"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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

export function WinnerBanner({ topLine, middleLine, bottomLine, fullhouse }: Props) {
  const lines = [topLine, middleLine, bottomLine];
  const anything = lines.some(Boolean) || fullhouse;
  if (!anything) return null;

  return (
    <Card>
      <CardContent className="flex flex-col gap-2 py-4">
        {lines.map((l, i) =>
          l ? (
            <div key={i} className="flex items-center gap-3 text-sm">
              <Badge variant="success"><CircleDot className="mr-1 h-3 w-3" />{lineLabels[i]}</Badge>
              <span className="font-mono">{shortenAddress(l.winner)}</span>
              <span className="text-muted-foreground">won {formatPlanck(l.payout, CHAIN.decimals, CHAIN.symbol)}</span>
            </div>
          ) : null,
        )}
        {fullhouse && (
          <div className="flex flex-col gap-1 border-t pt-2 mt-2">
            <div className="flex items-center gap-3 text-base font-semibold">
              <Badge><Trophy className="mr-1 h-4 w-4" />Full house</Badge>
              <span className="font-mono">{shortenAddress(fullhouse.winner)}</span>
              <span>{formatPlanck(fullhouse.payout, CHAIN.decimals, CHAIN.symbol)}</span>
            </div>
            {fullhouse.host && fullhouse.hostFee !== undefined && (
              <div className="text-xs text-muted-foreground">
                Host {shortenAddress(fullhouse.host)} earned {formatPlanck(fullhouse.hostFee, CHAIN.decimals, CHAIN.symbol)}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
