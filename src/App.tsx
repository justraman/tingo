import { Link, useRoute } from "@/lib/router";
import { HomePage } from "@/pages/HomePage";
import { NewGamePage } from "@/pages/NewGamePage";
import { GameView } from "@/pages/GameView";
import { PreviewPage } from "@/pages/PreviewPage";
import { AccountButton } from "@/components/AccountButton";
import { VibeChooser } from "@/components/VibeChooser";
import { useVibe } from "@/lib/store/vibe";
import { cn } from "@/lib/utils";
import { Plus } from "lucide-react";

function Routes() {
  const path = useRoute();

  const game = path.match(/^\/game\/(\d+)$/);
  if (game) return <GameView key={game[1]} id={game[1]} />;
  if (path === "/host/new") return <NewGamePage />;
  if (import.meta.env.DEV && path === "/preview") return <PreviewPage />;
  return <HomePage />;
}

function AmbientBackdrop() {
  return (
    <div className="ambient" aria-hidden>
      <div className="ambient-noise" />
    </div>
  );
}

function BrandMark() {
  const vibe = useVibe();

  if (vibe === "vintage") {
    return (
      <span className="flex items-center gap-2.5">
        <span className="flex h-8 w-8 -rotate-6 items-center justify-center rounded-full border-2 border-double border-[hsl(var(--brand-foreground))] bg-[hsl(var(--brand))] font-display text-[15px] font-black text-[hsl(var(--brand-foreground))] shadow-[0_3px_0_hsl(11_50%_30%/0.35)]">
          T
        </span>
        <span className="font-display text-2xl font-black tracking-tight text-[hsl(var(--brand))]">Tambola</span>
      </span>
    );
  }

  const dots =
    vibe === "arcade"
      ? ["hsl(var(--brand))", "hsl(var(--gold))", "hsl(var(--spark))"]
      : ["hsl(14 58% 60% / 0.85)", "hsl(40 62% 58% / 0.85)", "hsl(205 52% 60% / 0.85)"];

  return (
    <span className="flex items-center gap-2.5">
      <span className="relative flex h-7 w-7 items-center justify-center">
        <span className="absolute left-0 top-0 h-4 w-4 rounded-full" style={{ background: dots[0], boxShadow: vibe === "arcade" ? `0 0 10px ${dots[0]}` : undefined }} />
        <span className="absolute right-0 top-1 h-4 w-4 rounded-full" style={{ background: dots[1], boxShadow: vibe === "arcade" ? `0 0 10px ${dots[1]}` : undefined }} />
        <span className="absolute bottom-0 left-1.5 h-4 w-4 rounded-full" style={{ background: dots[2], boxShadow: vibe === "arcade" ? `0 0 10px ${dots[2]}` : undefined }} />
      </span>
      <span className={cn("text-lg font-semibold tracking-tight", vibe === "arcade" && "font-display text-xl")}>Tambola</span>
    </span>
  );
}

const MARQUEE_HUES = ["hsl(var(--brand))", "hsl(var(--gold))", "hsl(var(--spark))"];

function Marquee() {
  // Clip only the bulbs to the pill — the header itself must not clip, or it
  // cuts off the account popover that drops below it.
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-full">
      <div className="absolute inset-x-0 top-1.5 flex justify-center gap-3">
        {Array.from({ length: 22 }, (_, i) => {
          const c = MARQUEE_HUES[i % 3];
          return (
            <span
              key={i}
              className="bulb"
              style={{ background: c, boxShadow: `0 0 7px ${c}`, animationDelay: `${(i % 4) * 0.28}s` }}
            />
          );
        })}
      </div>
    </div>
  );
}

export function App() {
  const vibe = useVibe();
  return (
    <>
      <AmbientBackdrop />
      <header className="sticky top-0 z-40 px-4 pt-4">
        <div className="glass-strong container relative flex h-14 items-center justify-between rounded-full px-6">
          {vibe === "arcade" && <Marquee />}
          <Link href="/" className="relative transition-opacity hover:opacity-80">
            <BrandMark />
          </Link>
          <div className="relative flex items-center gap-2">
            <Link
              href="/host/new"
              className="inline-flex h-9 items-center gap-1.5 rounded-full border border-[var(--line)] bg-[var(--fill)] px-4 text-sm font-medium text-foreground/90 backdrop-blur-xl transition-colors hover:bg-[var(--fill-hover)] hover:text-foreground"
            >
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">Host a game</span>
            </Link>
            <AccountButton />
          </div>
        </div>
      </header>
      <main className="container py-8">
        <Routes />
      </main>
      <VibeChooser />
    </>
  );
}
