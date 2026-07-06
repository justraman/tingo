"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { isHostAsync } from "@/lib/host/detect";
import { readNextGameId, readGame } from "@/lib/tambola/read";
import { CHAIN } from "@/lib/chain/constants";
import { formatPlanck, shortenAddress } from "@/lib/utils";
import type { GameView } from "@/lib/tambola/abi";

interface Listing { id: bigint; game: GameView; }

const STATE_LABELS = ["Pending", "Live", "Won", "NoWinner"];
const STATE_VARIANTS: Record<number, "default" | "secondary" | "success" | "outline"> = {
  0: "secondary", 1: "default", 2: "success", 3: "outline",
};

export default function HomePage() {
  const [games, setGames] = useState<Listing[]>([]);
  const [inHost, setInHost] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void isHostAsync().then(setInHost);
  }, []);

  useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        const next = await readNextGameId();           // last allocated id (0 if no games)
        const out: Listing[] = [];
        for (let id = 1n; id <= next; id++) {            // ids are 1-based, so `<= next` is correct
          const g = await readGame(id);
          if (g.host !== "0x0000000000000000000000000000000000000000") {
            out.push({ id, game: g });
          }
        }
        if (!cancel) setGames(out.reverse());
      } finally {
        if (!cancel) setLoading(false);
      }
    })();
    return () => { cancel = true; };
  }, []);

  if (inHost === false) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Open this app in Polkadot Desktop</CardTitle>
          <CardDescription>
            Tambola is a Polkadot Triangle product. Open it inside the Polkadot Desktop or Web host so the
            in-game chat and wallet signer can hook in.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Games</h1>
          <p className="text-sm text-muted-foreground">paseo-next-v2 Asset Hub · {CHAIN.symbol}</p>
        </div>
        <Link href="/host/new"><Button>Schedule a game</Button></Link>
      </div>

      {loading && <div className="text-sm text-muted-foreground">Loading…</div>}

      {!loading && games.length === 0 && (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            No games yet. Be the first to host one.
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {games.map(({ id, game }) => (
          <Card key={id.toString()}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">Game #{id.toString()}</CardTitle>
                <Badge variant={STATE_VARIANTS[game.state] ?? "outline"}>{STATE_LABELS[game.state]}</Badge>
              </div>
              <CardDescription>Host {shortenAddress(game.host)}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              <div>Ticket: <span className="font-medium">{formatPlanck(game.ticketPrice, CHAIN.decimals, CHAIN.symbol)}</span></div>
              <div>Players: {game.playerCount} / {game.maxPlayers}</div>
              <div>Pot: <span className="font-medium">{formatPlanck(game.pot, CHAIN.decimals, CHAIN.symbol)}</span></div>
              <div className="text-xs text-muted-foreground">Drawn: {game.drawnCount.toString()} / 90</div>
            </CardContent>
            <CardFooter>
              <Link className="w-full" href={`/game/${id}/`}><Button variant="outline" className="w-full">Open</Button></Link>
            </CardFooter>
          </Card>
        ))}
      </div>
    </div>
  );
}
