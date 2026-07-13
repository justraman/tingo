import { Confetti } from "@/components/Confetti";
import { AddressLabel } from "@/components/AddressLabel";
import { useVibe } from "@/lib/store/vibe";
import { formatPlanck } from "@/lib/utils";
import { CHAIN } from "@/lib/chain/constants";
import type { FullhousePrize } from "@/lib/tambola/prize";

interface Props {
  winners: FullhousePrize[];
  noWinner: boolean;
}

const CONFETTI = {
  arcade:  ["hsl(338 100% 59%)", "hsl(188 100% 57%)", "hsl(46 100% 60%)", "hsl(154 90% 59%)", "hsl(268 100% 71%)"],
  vintage: ["hsl(11 56% 51%)", "hsl(125 17% 37%)", "hsl(39 67% 55%)", "hsl(43 40% 72%)", "hsl(38 17% 41%)"],
};

function WinnerLine({ winners }: { winners: FullhousePrize[] }) {
  if (winners.length === 1) return <><AddressLabel address={winners[0].winner} /> takes the pot</>;
  return <>Split between {winners.length} players</>;
}

/** Inline winner celebration shown in the game for arcade & vintage (alongside
    the full-screen WinOverlay). Arcade is a neon marquee; vintage a stamped
    certificate. */
export function WinnerCelebration({ winners, noWinner }: Props) {
  const vibe = useVibe();
  const won = winners.length > 0;
  const total = winners.reduce((sum, w) => sum + w.payout, 0n);
  if (!won && !noWinner) return null;

  if (vibe === "vintage") {
    return (
      <div className="glass paper-frame animate-rise relative overflow-hidden rounded-lg p-8 text-center">
        {won && <Confetti colors={CONFETTI.vintage} />}
        <div className="relative">
          {won ? (
            <>
              <span className="animate-float-soft mx-auto flex h-16 w-16 items-center justify-center rounded-full border-[3px] border-double border-[hsl(var(--brand-foreground))] bg-[hsl(var(--brand))] font-display text-2xl font-black text-[hsl(var(--brand-foreground))] shadow-[0_4px_0_hsl(11_50%_30%/0.35)]">★</span>
              <div className="font-game mt-3 text-xs uppercase tracking-[0.35em] text-[hsl(var(--spark))]">· We have a winner ·</div>
              <h2 className="font-display mt-1 text-4xl font-black italic text-[hsl(var(--brand))]">Full House!</h2>
              <div className="font-game mt-3 text-[11px] uppercase tracking-widest text-muted-foreground"><WinnerLine winners={winners} /></div>
              <div className="font-display text-3xl font-black text-[hsl(var(--spark))]">{formatPlanck(total, CHAIN.decimals, CHAIN.symbol)}</div>
            </>
          ) : (
            <>
              <h2 className="font-display text-3xl font-black italic text-muted-foreground">No Full House</h2>
              <p className="mt-1 text-sm text-muted-foreground">The pot is refunded to ticket holders.</p>
            </>
          )}
        </div>
      </div>
    );
  }

  // Arcade neon marquee
  return (
    <div className="glass scanlines animate-rise relative overflow-hidden rounded-3xl p-6 text-center">
      {won && <Confetti colors={CONFETTI.arcade} />}
      <div className="relative">
        {won ? (
          <>
            <div className="animate-float-soft text-5xl leading-none">🏆</div>
            <div className="mt-2 text-xs font-bold uppercase tracking-[0.3em] text-[hsl(var(--spark))]">◆ Winner ◆</div>
            <h2 className="font-display mt-1 text-4xl uppercase sm:text-5xl" style={{ textShadow: "0 0 28px hsl(338 100% 59% / 0.6), 3px 3px 0 hsl(188 100% 57% / 0.4)" }}>Full House!</h2>
            <div className="mt-3 text-[11px] uppercase tracking-widest text-muted-foreground"><WinnerLine winners={winners} /></div>
            <div className="font-display text-3xl text-[hsl(var(--gold))]" style={{ textShadow: "0 0 18px hsl(var(--gold) / 0.5)" }}>{formatPlanck(total, CHAIN.decimals, CHAIN.symbol)}</div>
          </>
        ) : (
          <>
            <h2 className="font-display text-3xl uppercase text-muted-foreground">No Full House</h2>
            <p className="mt-1 text-sm text-muted-foreground">The pot is refunded to ticket holders.</p>
          </>
        )}
      </div>
    </div>
  );
}
