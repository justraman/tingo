import { useState } from "react";
import { useHostMode } from "@use-truapi/react";
import { Link } from "@/lib/router";
import { Button } from "@/components/ui/button";
import { GameCard } from "@/components/GameCard";
import { LobbyHero } from "@/components/LobbyHero";
import { useGames, type GameListing } from "@/lib/tambola/use-games";
import { useVibe } from "@/lib/store/vibe";
import { Trophy } from "lucide-react";
import { STATE_LABELS } from "@/lib/tambola/state";

function StateFilter({ games, filter, onChange }: {
  games: GameListing[];
  filter: number | null;
  onChange: (state: number | null) => void;
}) {
  const counts = games.reduce<Record<number, number>>((acc, { state }) => {
    acc[state] = (acc[state] ?? 0) + 1;
    return acc;
  }, {});
  const options: Array<{ state: number | null; label: string; count: number }> = [
    { state: null, label: "All", count: games.length },
    ...STATE_LABELS.map((label, state) => ({ state, label, count: counts[state] ?? 0 })),
  ];
  return (
    <div className="flex flex-wrap gap-2">
      {options.filter((o) => o.state === null || o.count > 0).map(({ state, label, count }) => {
        const active = filter === state;
        return (
          <button
            key={label}
            type="button"
            onClick={() => onChange(state)}
            className={`inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
              active
                ? "border-[var(--line-strong)] bg-[var(--fill-strong)] text-foreground"
                : "border-[var(--line)] bg-transparent text-muted-foreground hover:bg-[var(--fill)] hover:text-foreground/80"
            }`}
          >
            {label}
            <span className="tabular-nums opacity-60">{count}</span>
          </button>
        );
      })}
    </div>
  );
}

export function HomePage() {
  const vibe = useVibe();
  const hostMode = useHostMode();
  const { data, isPending: loading, error } = useGames();
  const [filter, setFilter] = useState<number | null>(null);
  const games = data ?? [];
  const visible = filter === null ? games : games.filter(({ state }) => state === filter);

  if (hostMode === "standalone") {
    return (
      <div className="glass animate-rise mx-auto max-w-lg rounded-3xl p-8 text-center">
        <h2 className="font-display text-xl font-semibold leading-tight">Open this app in Polkadot Desktop</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Tambola is a Polkadot Triangle product. Open it inside the Polkadot Desktop or Web host so the
          in-game chat and wallet signer can hook in.
        </p>
      </div>
    );
  }

  const showFilters = !loading && !error && games.length > 0;

  return (
    <div className="flex flex-col gap-8">
      {vibe === "glass" ? (
        <div className="animate-rise flex flex-wrap items-end justify-between gap-4">
          <h1 className="font-display text-3xl font-bold tracking-tight">Games</h1>
          {showFilters && <StateFilter games={games} filter={filter} onChange={setFilter} />}
        </div>
      ) : (
        <div className="flex flex-col items-center gap-6">
          <LobbyHero />
          {showFilters && (
            <div className="flex justify-center">
              <StateFilter games={games} filter={filter} onChange={setFilter} />
            </div>
          )}
        </div>
      )}

      {loading && (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => <div key={i} className="skeleton h-56 rounded-3xl" />)}
        </div>
      )}

      {!loading && error && (
        <div className="glass animate-rise rounded-3xl p-6 text-center text-sm text-[hsl(var(--destructive))]">
          Couldn't reach the chain: {error.message}
        </div>
      )}

      {!loading && !error && games.length === 0 && (
        <div className="glass animate-rise flex flex-col items-center gap-3 rounded-3xl py-16 text-center">
          <Trophy className="h-8 w-8 text-muted-foreground/50" />
          <div className="text-sm text-muted-foreground">No games yet. Be the first to host one.</div>
          <Link href="/host/new"><Button variant="secondary" className="mt-2">Host a game</Button></Link>
        </div>
      )}

      {!loading && !error && games.length > 0 && visible.length === 0 && (
        <div className="glass animate-rise rounded-3xl py-12 text-center text-sm text-muted-foreground">
          No {STATE_LABELS[filter!].toLowerCase()} games right now.
        </div>
      )}

      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {visible.map(({ id, game, state }, i) => (
          <GameCard key={id.toString()} id={id} game={game} state={state} index={i} />
        ))}
      </div>
    </div>
  );
}
