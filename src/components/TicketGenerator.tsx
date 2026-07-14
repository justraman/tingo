import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { useDraftStore } from "@/lib/store/draft";
import { TicketGrid } from "./TicketGrid";
import { Sparkles, RefreshCw } from "lucide-react";

interface Props {
  gameId: bigint;
  ticketPrice: bigint;
  tokenSymbol: string;
  decimals: number;
  disabled?: boolean;
  onBuy: () => void;
  boughtCount?: number;
}

function format(amount: bigint, decimals: number): string {
  const divisor = 10n ** BigInt(decimals);
  const whole = amount / divisor;
  const rem   = amount % divisor;
  if (rem === 0n) return whole.toString();
  return `${whole.toString()}.${rem.toString().padStart(decimals, "0").replace(/0+$/, "")}`;
}

export function TicketGenerator({ gameId, ticketPrice, tokenSymbol, decimals, disabled, onBuy, boughtCount = 0 }: Props) {
  const draft = useDraftStore((s) => s.byGame[gameId.toString()]);
  const regenerate = useDraftStore((s) => s.regenerate);

  useEffect(() => {
    if (!draft) regenerate(gameId);
  }, [draft, gameId, regenerate]);

  return (
    <Card className="animate-rise">
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-lg">{boughtCount > 0 ? "Buy another ticket" : "Your ticket"}</CardTitle>
        <Button variant="ghost" size="sm" onClick={() => regenerate(gameId)} disabled={disabled}>
          <RefreshCw className="h-4 w-4" /> Shuffle
        </Button>
      </CardHeader>
      <CardContent>
        {draft ? (
          <div key={draft.grid.flat().join(",")} className="animate-fade">
            <TicketGrid grid={draft.grid} />
          </div>
        ) : (
          <div className="skeleton h-[10.5rem] w-full max-w-md" />
        )}
      </CardContent>
      <CardFooter>
        <Button onClick={onBuy} disabled={!draft || disabled} size="lg" className="w-full">
          <Sparkles className="h-5 w-5" />
          Buy ticket · {format(ticketPrice, decimals)} {tokenSymbol}
        </Button>
      </CardFooter>
    </Card>
  );
}
