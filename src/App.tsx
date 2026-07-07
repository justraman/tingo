import { Link, useRoute } from "@/lib/router";
import { HomePage } from "@/pages/HomePage";
import { NewGamePage } from "@/pages/NewGamePage";
import { GameView } from "@/pages/GameView";
import { PreviewPage } from "@/pages/PreviewPage";
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
      <div className="ambient-orb ambient-orb-1" />
      <div className="ambient-orb ambient-orb-2" />
      <div className="ambient-orb ambient-orb-3" />
      <div className="ambient-noise" />
      <div className="ambient-vignette" />
    </div>
  );
}

function BrandMark() {
  return (
    <span className="flex items-center gap-2.5">
      <span className="relative flex h-7 w-7 items-center justify-center">
        <span className="absolute left-0 top-0 h-4 w-4 rounded-full bg-[hsl(347_89%_61%)] opacity-90 shadow-[0_0_10px_hsl(347_89%_61%/0.5)]" />
        <span className="absolute right-0 top-1 h-4 w-4 rounded-full bg-[hsl(38_95%_56%)] opacity-90 shadow-[0_0_10px_hsl(38_95%_56%/0.5)]" />
        <span className="absolute bottom-0 left-1.5 h-4 w-4 rounded-full bg-[hsl(199_92%_56%)] opacity-90 shadow-[0_0_10px_hsl(199_92%_56%/0.5)]" />
      </span>
      <span className="text-lg font-bold tracking-tight">Tambola</span>
    </span>
  );
}

export function App() {
  return (
    <>
      <AmbientBackdrop />
      <header className="sticky top-0 z-40 px-4 pt-4">
        <div className="glass-strong container flex h-14 items-center justify-between rounded-full px-6">
          <Link href="/" className="transition-opacity hover:opacity-80">
            <BrandMark />
          </Link>
          <Link
            href="/host/new"
            className="inline-flex h-9 items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.06] px-4 text-sm font-medium text-foreground/90 backdrop-blur-xl transition-colors hover:bg-white/[0.12] hover:text-foreground"
          >
            <Plus className="h-4 w-4" />
            Host a game
          </Link>
        </div>
      </header>
      <main className="container py-8">
        <Routes />
      </main>
    </>
  );
}
