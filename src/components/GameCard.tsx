import { Link } from "@/lib/router";
import { Badge } from "@/components/ui/badge";
import { AddressLabel } from "@/components/AddressLabel";
import { CHAIN } from "@/lib/chain/constants";
import { formatPlanck } from "@/lib/utils";
import { STATE_LABELS, STATE_VARIANTS } from "@/lib/tambola/state";
import { useVibe } from "@/lib/store/vibe";
import { ArrowRight, Ticket } from "lucide-react";
import type { GameView } from "@/lib/tambola/abi";

interface Props { id: bigint; game: GameView; state: number; index: number; }

// state → accent hue / call-to-action wording, per vibe (indexed by STATE_LABELS).
const ARCADE_ACCENT = ["188 100% 57%", "154 90% 59%", "46 100% 60%", "268 100% 71%", "251 20% 55%"];
const VINTAGE_ACCENT = ["11 56% 51%", "125 17% 37%", "39 67% 55%", "20 30% 42%", "40 18% 55%"];
const ARCADE_CTA = ["Get ticket", "Play now", "See result", "View", "View"];
const VINTAGE_CTA = ["Grab a card", "Take a seat", "See result", "View table", "View table"];

export function GameCard({ id, game, state, index }: Props) {
  const vibe = useVibe();
  const sold = game.maxTickets > 0 ? game.ticketCount / game.maxTickets : 0;
  const pct = Math.round(sold * 100);
  const pot = formatPlanck(game.pot, CHAIN.decimals, CHAIN.symbol);
  const price = formatPlanck(game.ticketPrice, CHAIN.decimals, CHAIN.symbol);
  const drawn = game.drawnCount.toString();
  const delay = `${Math.min(index * 60, 400)}ms`;

  if (vibe === "arcade") {
    const accent = ARCADE_ACCENT[state] ?? ARCADE_ACCENT[0];
    return (
      <Link href={`/game/${id}`} className="block">
        <div
          className="glass glass-interactive animate-rise relative flex h-full cursor-pointer flex-col overflow-hidden rounded-3xl p-6"
          style={{ animationDelay: delay }}
        >
          <span className="absolute inset-x-0 top-0 h-1" style={{ background: `hsl(${accent})`, boxShadow: `0 0 14px hsl(${accent})` }} />
          <div className="flex items-center justify-between">
            <span className="font-display text-xl">#{id.toString()}</span>
            <Badge variant={STATE_VARIANTS[state] ?? "outline"}>{STATE_LABELS[state]}</Badge>
          </div>
          <div className="mt-1 text-xs text-muted-foreground">Host <AddressLabel address={game.host} /></div>

          <div className="mt-5 flex items-end justify-between gap-3">
            <div>
              <div className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground">Jackpot</div>
              <div className="font-display text-2xl" style={{ color: `hsl(${accent})`, textShadow: `0 0 18px hsl(${accent} / 0.4)` }}>{pot}</div>
            </div>
            <div className="text-right text-xs leading-relaxed text-muted-foreground">
              <div>{price} / ticket</div>
              <div>{drawn} / 90 drawn</div>
            </div>
          </div>

          <div className="mt-4">
            <div className="mb-1.5 flex justify-between text-[11px] text-muted-foreground">
              <span>🎟 {game.ticketCount} / {game.maxTickets}</span>
              <span>{pct}% sold</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-[var(--track)]">
              <div className="h-full rounded-full transition-[width] duration-700" style={{ width: `${Math.max(pct, 3)}%`, background: `hsl(${accent})`, boxShadow: `0 0 10px hsl(${accent})` }} />
            </div>
          </div>

          <div className="font-display mt-5 text-xs tracking-wide" style={{ color: `hsl(${accent})` }}>{ARCADE_CTA[state] ?? "View"} ▸</div>
        </div>
      </Link>
    );
  }

  if (vibe === "vintage") {
    const accent = VINTAGE_ACCENT[state] ?? VINTAGE_ACCENT[0];
    const tilt = (Number(id) % 2 ? 1 : -1) * (0.8 + (Number(id) % 3) * 0.3);
    return (
      <Link href={`/game/${id}`} className="block">
        {/* Tilt on a wrapper so the .glass-interactive hover-lift transform still applies. */}
        <div className="h-full" style={{ transform: `rotate(${tilt}deg)` }}>
          <div className="glass glass-interactive animate-rise relative flex h-full cursor-pointer flex-col rounded-2xl p-5" style={{ animationDelay: delay }}>
            <span
              className="font-game absolute -top-3 right-4 inline-flex h-6 items-center rounded-[3px] px-3 text-[10px] uppercase tracking-wider text-[hsl(var(--brand-foreground))]"
              style={{ background: `hsl(${accent})`, transform: "rotate(3deg)", boxShadow: "0 2px 0 hsl(40 30% 30% / 0.25)" }}
            >
              {STATE_LABELS[state]}
            </span>
            <div className="font-display text-xl font-black">Table No. {id.toString()}</div>
            <div className="font-game mt-0.5 text-[11px] text-muted-foreground">caller <AddressLabel address={game.host} /></div>
            <div className="my-3 border-t border-dashed border-[var(--line-strong)]" />

            <div className="flex items-end justify-between gap-3">
              <div>
                <div className="font-game text-[10px] uppercase tracking-widest text-muted-foreground">The pot</div>
                <div className="font-display text-2xl font-black text-[hsl(var(--spark))]">{pot}</div>
              </div>
              <div className="font-game text-right text-[11px] leading-relaxed text-muted-foreground">
                <div>{price} / card</div>
                <div>{drawn} / 90 called</div>
              </div>
            </div>

            <div className="mt-3">
              <div className="font-game mb-1.5 flex justify-between text-[10px] text-muted-foreground">
                <span>{game.ticketCount} / {game.maxTickets} cards</span>
                <span>{pct}% sold</span>
              </div>
              <div className="h-2 overflow-hidden rounded-[2px] border border-[var(--line)] bg-[var(--track)]">
                <div className="h-full transition-[width] duration-700" style={{ width: `${Math.max(pct, 3)}%`, background: `hsl(${accent})` }} />
              </div>
            </div>

            <div className="font-game mt-4 text-[11px] uppercase tracking-wider text-[hsl(var(--brand))]">{VINTAGE_CTA[state] ?? "View table"} →</div>
          </div>
        </div>
      </Link>
    );
  }

  // Mystic — the original design.
  return (
    <Link href={`/game/${id}`} className="block">
      <div className="glass glass-interactive animate-rise flex h-full cursor-pointer flex-col rounded-3xl p-6" style={{ animationDelay: delay }}>
        <div className="flex items-center justify-between">
          <span className="font-display text-lg font-bold tracking-tight">Game #{id.toString()}</span>
          <Badge variant={STATE_VARIANTS[state] ?? "outline"}>{STATE_LABELS[state]}</Badge>
        </div>
        <div className="mt-1 text-xs text-muted-foreground">Host <AddressLabel address={game.host} /></div>

        <div className="mt-5 flex items-end justify-between">
          <div>
            <div className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground">Pot</div>
            <div className="font-game text-2xl font-bold tabular-nums">{pot}</div>
          </div>
          <div className="text-right text-xs text-muted-foreground">
            <div>{price} / ticket</div>
            <div className="mt-0.5">{drawn} / 90 drawn</div>
          </div>
        </div>

        <div className="mt-4">
          <div className="mb-1.5 flex justify-between text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1"><Ticket className="h-3 w-3" /> {game.ticketCount} / {game.maxTickets}</span>
            <span>{pct}% sold</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-[var(--track)]">
            <div className="h-full rounded-full bg-[var(--track-fill)] transition-[width] duration-700" style={{ width: `${Math.max(pct, 2)}%` }} />
          </div>
        </div>

        <div className="mt-5 flex items-center justify-end gap-1 text-sm font-medium text-foreground/70">
          Open <ArrowRight className="h-4 w-4" />
        </div>
      </div>
    </Link>
  );
}
