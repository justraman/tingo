import { useVibe } from "@/lib/store/vibe";

/** The lobby's headline, distinct per vibe. Mystic returns null — HomePage
    keeps its compact left-aligned "Games" heading there. */
export function LobbyHero() {
  const vibe = useVibe();

  if (vibe === "arcade") {
    return (
      <div className="animate-rise text-center">
        <div className="mb-3 text-xs font-bold uppercase tracking-[0.3em] text-[hsl(var(--spark))]">
          ◆ On-chain Indian Bingo ◆
        </div>
        <h1
          className="font-display text-5xl uppercase leading-none sm:text-6xl"
          style={{ textShadow: "0 0 28px hsl(var(--brand) / 0.55), 4px 4px 0 hsl(var(--spark) / 0.35)" }}
        >
          Game Night
        </h1>
        <p className="mx-auto mt-4 max-w-md text-sm text-muted-foreground">
          Pick a table, grab a ticket, and let the contract call the numbers. Full house takes the jackpot.
        </p>
      </div>
    );
  }

  if (vibe === "vintage") {
    return (
      <div className="animate-rise text-center">
        <div className="font-game mb-3 text-xs uppercase tracking-[0.4em] text-[hsl(var(--spark))]">
          · Eyes down — it's time to play ·
        </div>
        <h1 className="font-display text-4xl font-black italic text-[hsl(var(--brand))] sm:text-5xl">Housie Night</h1>
        <div className="mx-auto mt-4 h-px w-44 bg-[hsl(var(--foreground)/0.6)]" />
        <p className="mx-auto mt-3 max-w-md text-sm italic text-muted-foreground">
          Pick a table, take a number card, and let the caller roll. First full house takes the pot.
        </p>
      </div>
    );
  }

  return null;
}
