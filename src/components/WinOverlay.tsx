import { Trophy } from "lucide-react";
import { Link } from "@/lib/router";
import { Button } from "@/components/ui/button";
import { AddressLabel } from "@/components/AddressLabel";
import { Confetti } from "@/components/Confetti";
import { useVibe, type Vibe } from "@/lib/store/vibe";
import { formatPlanck, cn } from "@/lib/utils";
import { CHAIN } from "@/lib/chain/constants";
import type { FullhousePrize } from "@/lib/tambola/prize";

interface Props {
  winners: FullhousePrize[];
  noWinner: boolean;
  onOpenGame: () => void;
}

const BACKDROP: Record<Vibe, string> = {
  glass:   "radial-gradient(circle at 50% 38%, hsl(42 55% 62% / 0.16), transparent 60%), hsl(240 30% 2% / 0.88)",
  arcade:  "radial-gradient(circle at 50% 40%, hsl(268 100% 71% / 0.28), hsl(253 43% 4% / 0.92) 70%)",
  vintage: "radial-gradient(circle at 50% 40%, hsl(48 60% 96% / 0.92), hsl(39 45% 68% / 0.94) 72%)",
};

// Stable references so Confetti's useMemo doesn't regenerate each render.
const CONFETTI: Record<Vibe, string[]> = {
  glass:   ["hsl(42 55% 62%)", "hsl(14 58% 60%)", "hsl(40 62% 58%)", "hsl(162 40% 52%)", "hsl(205 52% 60%)"],
  arcade:  ["hsl(338 100% 59%)", "hsl(188 100% 57%)", "hsl(46 100% 60%)", "hsl(154 90% 59%)", "hsl(268 100% 71%)"],
  vintage: ["hsl(11 56% 51%)", "hsl(125 17% 37%)", "hsl(39 67% 55%)", "hsl(43 40% 72%)", "hsl(38 17% 41%)"],
};

const EYEBROW: Record<Vibe, { win: string; none: string }> = {
  glass:   { win: "Winner", none: "Game over" },
  arcade:  { win: "◆ Winner ◆", none: "◆ Game over ◆" },
  vintage: { win: "· We have a winner ·", none: "· Game over ·" },
};

function WinIcon({ vibe }: { vibe: Vibe }) {
  if (vibe === "arcade") return <div className="animate-float-soft text-6xl leading-none">🏆</div>;
  if (vibe === "vintage") {
    return (
      <span className="animate-float-soft flex h-[76px] w-[76px] items-center justify-center rounded-full border-[3px] border-double border-[hsl(var(--brand-foreground))] bg-[hsl(var(--brand))] font-display text-3xl font-black text-[hsl(var(--brand-foreground))] shadow-[0_4px_0_hsl(11_50%_30%/0.35)]">
        ★
      </span>
    );
  }
  return (
    <span className="animate-float-soft flex h-16 w-16 items-center justify-center rounded-full border border-[hsl(var(--gold)/0.45)] bg-[hsl(var(--gold)/0.12)]">
      <Trophy className="h-7 w-7 text-[hsl(var(--gold))]" />
    </span>
  );
}

export function WinOverlay({ winners, noWinner, onOpenGame }: Props) {
  const vibe = useVibe();
  const won = winners.length > 0;
  const total = winners.reduce((sum, w) => sum + w.payout, 0n);

  const titleClass = cn(
    "font-display mt-4 text-5xl font-black leading-none sm:text-6xl",
    vibe === "vintage" ? "italic text-[hsl(var(--brand))]" : "text-foreground",
  );
  const titleStyle =
    vibe === "arcade"
      ? { textShadow: "0 0 28px hsl(338 100% 59% / 0.6), 3px 3px 0 hsl(188 100% 57% / 0.4)" }
      : undefined;
  const potClass = cn(
    "font-display text-3xl font-black sm:text-4xl",
    vibe === "vintage" ? "text-[hsl(var(--spark))]" : "text-[hsl(var(--gold))]",
  );

  return (
    <div
      className="animate-fade fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto p-6 text-center backdrop-blur-md"
      style={{ background: BACKDROP[vibe] }}
    >
      {won && <Confetti colors={CONFETTI[vibe]} />}
      <div className="animate-win-pop relative flex flex-col items-center">
        <WinIcon vibe={vibe} />
        <div className="mt-3 text-xs font-semibold uppercase tracking-[0.35em] text-muted-foreground">
          {won ? EYEBROW[vibe].win : EYEBROW[vibe].none}
        </div>
        <h1 className={titleClass} style={titleStyle}>
          {won ? "Full House!" : "No Full House"}
        </h1>

        <div className="glass glass-inset mt-6 inline-flex min-w-[16rem] flex-col items-center gap-1 rounded-2xl px-8 py-4">
          <span className="text-[11px] uppercase tracking-widest text-muted-foreground">
            {won ? (
              winners.length === 1 ? (
                <><AddressLabel address={winners[0].winner} /> takes the pot</>
              ) : (
                <>Split between {winners.length} players</>
              )
            ) : (
              "The pot is refunded to ticket holders"
            )}
          </span>
          {won && <span className={potClass}>{formatPlanck(total, CHAIN.decimals, CHAIN.symbol)}</span>}
        </div>

        <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
          <Button variant="secondary" onClick={onOpenGame}>Open the game</Button>
          <Button asChild>
            <Link href="/">Back to games</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
