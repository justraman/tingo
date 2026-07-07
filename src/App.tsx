import { useEffect } from "react";
import { Link, navigate, useHashLocation } from "@/lib/router";
import { HomePage } from "@/pages/HomePage";
import { NewGamePage } from "@/pages/NewGamePage";
import { GameView } from "@/pages/GameView";

function LegacyGameRedirect({ id }: { id: string | null }) {
  useEffect(() => {
    navigate(id ? `/game/${id}` : "/", { replace: true });
  }, [id]);
  return <div className="text-sm text-muted-foreground">Redirecting…</div>;
}

function Routes() {
  const { path, query } = useHashLocation();

  const game = path.match(/^\/game\/(\d+)$/);
  if (game) return <GameView key={game[1]} id={game[1]} />;
  if (path === "/game") return <LegacyGameRedirect id={query.get("id")} />;
  if (path === "/host/new") return <NewGamePage />;
  return <HomePage />;
}

export function App() {
  return (
    <>
      <header className="border-b">
        <div className="container flex h-14 items-center justify-between">
          <Link href="/" className="font-bold tracking-tight text-lg">🎯 Tambola</Link>
          <Link href="/host/new" className="text-sm text-muted-foreground hover:text-foreground">Host a game</Link>
        </div>
      </header>
      <main className="container py-6">
        <Routes />
      </main>
    </>
  );
}
