import { useEffect, useState } from "react";
import { Link } from "@/lib/router";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { isHostAsync } from "@/lib/host/detect";
import { readNextGameId, readGame } from "@/lib/tambola/read";
import { CHAIN } from "@/lib/chain/constants";
import { formatPlanck } from "@/lib/utils";
import { AddressLabel } from "@/components/AddressLabel";
import { useVibe } from "@/lib/store/vibe";
import { cn } from "@/lib/utils";
import { ArrowRight, Ticket, Trophy } from "lucide-react";
import type { GameView } from "@/lib/tambola/abi";
import { STATE_LABELS, STATE_VARIANTS, effectiveState } from "@/lib/tambola/state";

interface Listing { id: bigint; game: GameView; state: number; }

function GameCard({ id, game, state, index }: Listing & { index: number }) {
  const vibe = useVibe();
  const sold = game.maxTickets > 0 ? game.ticketCount / game.maxTickets : 0;
  // Vintage: pinned-card tilt, alternating by position.
  const tilt = vibe === "vintage" ? (index % 2 === 0 ? -1 : 1) * (1 + (index % 3) * 0.4) : 0;
  return (
    <Link href={`/game/${id}`} className="block">
      <div
        className="glass glass-interactive animate-rise flex h-full cursor-pointer flex-col rounded-3xl p-6"
        style={{ animationDelay: `${Math.min(index * 60, 400)}ms`, transform: tilt ? `rotate(${tilt}deg)` : undefined }}
      >
        <div className="flex items-center justify-between">
          <span className="font-display text-lg font-bold tracking-tight">Game #{id.toString()}</span>
          <Badge variant={STATE_VARIANTS[state] ?? "outline"}>{STATE_LABELS[state]}</Badge>
        </div>
        <div className="mt-1 text-xs text-muted-foreground">Host <AddressLabel address={game.host} /></div>

        <div className="mt-5 flex items-end justify-between">
          <div>
            <div className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground">Pot</div>
            <div className="font-game text-2xl font-bold tabular-nums">
              {formatPlanck(game.pot, CHAIN.decimals, CHAIN.symbol)}
            </div>
          </div>
          <div className="text-right text-xs text-muted-foreground">
            <div>{formatPlanck(game.ticketPrice, CHAIN.decimals, CHAIN.symbol)} / ticket</div>
            <div className="mt-0.5">{game.drawnCount.toString()} / 90 drawn</div>
          </div>
        </div>

        <div className="mt-4">
          <div className="mb-1.5 flex justify-between text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1"><Ticket className="h-3 w-3" /> {game.ticketCount} / {game.maxTickets}</span>
            <span>{Math.round(sold * 100)}% sold</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-[var(--track)]">
            <div
              className="h-full rounded-full bg-[var(--track-fill)] transition-[width] duration-700"
              style={{ width: `${Math.max(sold * 100, 2)}%` }}
            />
          </div>
        </div>

        <div className="mt-5 flex items-center justify-end gap-1 text-sm font-medium text-foreground/70">
          Open <ArrowRight className="h-4 w-4" />
        </div>
      </div>
    </Link>
  );
}

function StateFilter({ games, filter, onChange }: {
  games: Listing[];
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
  const [games, setGames] = useState<Listing[]>([]);
  const [inHost, setInHost] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>("");
  const [filter, setFilter] = useState<number | null>(null);
  const visible = filter === null ? games : games.filter(({ state }) => state === filter);

  useEffect(() => {
    void isHostAsync().then(setInHost);
  }, []);

  useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        const next = await readNextGameId();           // last allocated id (0 if no games)
        const nowSec = Math.floor(Date.now() / 1000);
        const out: Listing[] = [];
        for (let id = 1n; id <= next; id++) {            // ids are 1-based, so `<= next` is correct
          const g = await readGame(id);
          if (g.host !== "0x0000000000000000000000000000000000000000") {
            out.push({ id, game: g, state: effectiveState(g, nowSec) });
          }
        }
        if (!cancel) setGames(out.reverse());
      } catch (e: any) {
        if (!cancel) setError(e?.message ?? String(e));
      } finally {
        if (!cancel) setLoading(false);
      }
    })();
    return () => { cancel = true; };
  }, []);

  if (inHost === false) {
    return (
      <div className="glass animate-rise mx-auto max-w-lg rounded-3xl p-8 text-center">
        <h2 className="text-xl font-semibold leading-tight">Open this app in Polkadot Desktop</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Tambola is a Polkadot Triangle product. Open it inside the Polkadot Desktop or Web host so the
          in-game chat and wallet signer can hook in.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="animate-rise flex flex-wrap items-end justify-between gap-4">
        <h1 className="font-display text-3xl font-bold tracking-tight">Games</h1>
        {!loading && !error && games.length > 0 && (
          <StateFilter games={games} filter={filter} onChange={setFilter} />
        )}
      </div>

      {loading && (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => <div key={i} className="skeleton h-56 rounded-3xl" />)}
        </div>
      )}

      {!loading && error && (
        <div className="glass animate-rise rounded-3xl p-6 text-center text-sm text-[hsl(var(--destructive))]">
          Couldn't reach the chain: {error}
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
