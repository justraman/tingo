import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

import { TicketGrid } from "@/components/TicketGrid";
import { NumberBoard } from "@/components/NumberBoard";
import { Countdown } from "@/components/Countdown";
import { TicketGenerator } from "@/components/TicketGenerator";
import { ChatPanel } from "@/components/ChatPanel";
import { WalletStatus } from "@/components/WalletStatus";
import { WinnerBanner } from "@/components/WinnerBanner";

import { useAccounts } from "@/lib/chain/use-accounts";
import { useWalletStore } from "@/lib/store/wallet";
import { useDraftStore } from "@/lib/store/draft";
import { useGameStore } from "@/lib/store/game";
import { useChatStore } from "@/lib/store/chat";

import { getClient } from "@/lib/chain/client";
import {
  readGame, readDrawnNumbers, readTickets, readTicketsByOwner, readIsRefundClaimed, readWithdrawable,
} from "@/lib/tambola/read";
import { callBuyTicket, callClaimRefund, callDrawNumber, callWithdraw } from "@/lib/tambola/write";
import { subscribeEvents } from "@/lib/tambola/events";
import { gridFromMasks } from "@/lib/tambola/encode";
import { BLOCK_TIME_SECONDS, BLOCKS_BETWEEN_DRAWS, CHAIN } from "@/lib/chain/constants";
import { formatPlanck, shortenAddress, cn } from "@/lib/utils";

import type { TicketView } from "@/lib/tambola/abi";

const STATE_LABELS = ["Pending", "Live", "Won", "NoWinner"];

// How long past due a draw may be before we assume the worker is down and
// offer the player the permissionless drawNumber poke.
const WORKER_GRACE_SECONDS = 120;
const WORKER_GRACE_BLOCKS = BigInt(Math.ceil(WORKER_GRACE_SECONDS / BLOCK_TIME_SECONDS));

export function GameView({ id }: { id: string }) {
  const gameId = BigInt(id);

  const { accounts, isReady } = useAccounts();
  const selected = useWalletStore((s) => s.selectedAddress) ?? accounts[0]?.address;
  const setSelected = useWalletStore((s) => s.setSelected);

  const draft = useDraftStore((s) => s.byGame[gameId.toString()]);
  const clearDraft = useDraftStore((s) => s.clear);

  const snap = useGameStore((s) => s.byId[gameId.toString()]);
  const bestBlock = useGameStore((s) => s.bestBlock);
  const setBestBlock = useGameStore((s) => s.setBestBlock);
  const setGame = useGameStore((s) => s.setGame);
  const appendDrawn = useGameStore((s) => s.appendDrawn);
  const appendLineWinner = useGameStore((s) => s.appendLineWinner);
  const setFinalWinner = useGameStore((s) => s.setFinalWinner);
  const setNoWinner = useGameStore((s) => s.setNoWinner);

  const closeChat = useChatStore((s) => s.close);

  const [myTickets,  setMyTickets]  = useState<TicketView[]>([]);
  const [allTickets, setAllTickets] = useState<TicketView[]>([]);
  const [tab, setTab] = useState<"mine" | "others">("mine");
  const [refundClaimed, setRefundClaimed] = useState<boolean>(false);
  const [withdrawable, setWithdrawableAmt] = useState<bigint>(0n);
  const [status, setStatus] = useState<string>("");
  const [busy,   setBusy]   = useState<boolean>(false);
  const [error,  setError]  = useState<string>("");
  const [nowSec, setNowSec] = useState(() => Math.floor(Date.now() / 1000));

  useEffect(() => {
    const t = setInterval(() => setNowSec(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(t);
  }, []);

  const refreshTickets = useCallback(async () => {
    try {
      const [all, mine] = await Promise.all([
        readTickets(gameId),
        selected ? readTicketsByOwner(gameId, selected) : Promise.resolve({ ids: [], tickets: [] }),
      ]);
      setAllTickets(all);
      setMyTickets(mine.tickets);
    } catch (e) { console.error(e); }
  }, [gameId, selected]);

  // Initial load: pull game + drawn numbers from chain.
  useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        const g = await readGame(gameId);
        const drawn = await readDrawnNumbers(gameId);
        if (cancel) return;
        setGame(gameId, { game: g, drawn });
        if (g.state === 2 && g.fullhouseWinner !== "0x0000000000000000000000000000000000000000") {
          // Best we can do on cold-load — actual payouts must be backfilled via
          // historical event scan; for now show the winner without an amount.
          setFinalWinner(gameId, { winner: g.fullhouseWinner, payout: 0n, host: g.host, hostFee: 0n });
        }
        if (g.state === 3) setNoWinner(gameId);
      } catch (e) { console.error(e); }
    })();
    return () => { cancel = true; };
  }, [gameId, setGame, setFinalWinner, setNoWinner]);

  // Tickets + my withdrawable whenever the wallet changes.
  useEffect(() => {
    void refreshTickets();
    if (!selected) { setWithdrawableAmt(0n); return; }
    let cancel = false;
    (async () => {
      try {
        if (snap?.noWinner) {
          const claimed = await readIsRefundClaimed(gameId, selected);
          if (!cancel) setRefundClaimed(claimed);
        }
        const w = await readWithdrawable(selected);
        if (!cancel) setWithdrawableAmt(w);
      } catch (e) { console.error(e); }
    })();
    return () => { cancel = true; };
  }, [gameId, selected, snap?.noWinner, refreshTickets]);

  // Subscribe to best-block.
  useEffect(() => {
    let unsub: (() => void) | undefined;
    (async () => {
      const client = await getClient();
      const sub = (client as any).bestBlocks$.subscribe({
        next: (blocks: any) => { if (blocks[0]) setBestBlock(BigInt(blocks[0].number)); },
      });
      unsub = () => sub.unsubscribe();
    })();
    return () => { unsub?.(); };
  }, [setBestBlock]);

  // Subscribe to Tambola contract events scoped to this game.
  useEffect(() => {
    let teardown: (() => void) | undefined;
    (async () => {
      teardown = await subscribeEvents((e) => {
        const evId = (e.args as any).gameId as bigint | undefined;
        if (evId !== gameId) return;
        switch (e.name) {
          case "TicketBought":
            void refreshTickets();
            break;
          case "NumberDrawn":
            appendDrawn(gameId, e.args.number);
            break;
          case "LineWon":
            appendLineWinner(gameId, { line: e.args.line, winner: e.args.winner, payout: e.args.payout });
            break;
          case "GameWon":
            setFinalWinner(gameId, {
              winner:  e.args.winner,
              payout:  e.args.payout,
              host:    e.args.host,
              hostFee: e.args.hostFee,
            });
            closeChat(gameId);
            break;
          case "GameEndedNoWinner":
            setNoWinner(gameId);
            closeChat(gameId);
            break;
        }
        // Refresh game scalars asynchronously.
        readGame(gameId).then((g) => setGame(gameId, { game: g })).catch(() => { /* ignore */ });
        if (selected) {
          readWithdrawable(selected).then(setWithdrawableAmt).catch(() => {});
        }
      });
    })();
    return () => { teardown?.(); };
  }, [gameId, selected, appendDrawn, appendLineWinner, setFinalWinner, setNoWinner, setGame, closeChat, refreshTickets]);

  const game = snap?.game;
  const drawn = snap?.drawn ?? [];
  const ended = game?.state === 2 || game?.state === 3;
  const lineWinner = (line: number) => snap?.lineWinners.find((w) => w.line === line);

  // The worker normally pokes drawNumber, but it is permissionless — when the
  // worker misses its slot by WORKER_GRACE, let the player poke instead.
  const startOverdue = game?.state === 0 && game.ticketCount > 0 &&
    nowSec >= Number(game.startTime) + WORKER_GRACE_SECONDS;
  const drawOverdue = game?.state === 1 && bestBlock > 0n &&
    bestBlock >= game.lastDrawBlock + BigInt(BLOCKS_BETWEEN_DRAWS) + WORKER_GRACE_BLOCKS;

  async function onBuy() {
    setError(""); setBusy(true);
    try {
      const account = accounts.find((a) => a.address === selected) ?? accounts[0];
      if (!account) throw new Error("Connect a wallet first");
      if (!game)   throw new Error("Game not loaded");
      if (!draft?.layout) throw new Error("No ticket draft");
      await callBuyTicket({
        signerAddress: account.address,
        signer: account.polkadotSigner as any,
        gameId,
        layout: draft.layout,
        ticketPrice: game.ticketPrice,
        onStatus: (s) => setStatus(s),
      });
      clearDraft(gameId);                    // a fresh draft is generated for the next buy
      await Promise.all([
        refreshTickets(),
        readGame(gameId).then((g) => setGame(gameId, { game: g })),
      ]);
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  }

  async function onDrawNumber() {
    setError(""); setBusy(true);
    try {
      const account = accounts.find((a) => a.address === selected) ?? accounts[0];
      if (!account) throw new Error("Connect a wallet first");
      await callDrawNumber({
        signerAddress: account.address,
        signer: account.polkadotSigner as any,
        gameId,
        onStatus: (s) => setStatus(s),
      });
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  }

  async function onRefund() {
    setError(""); setBusy(true);
    try {
      const account = accounts.find((a) => a.address === selected) ?? accounts[0];
      if (!account) throw new Error("Connect a wallet first");
      await callClaimRefund({
        signerAddress: account.address,
        signer: account.polkadotSigner as any,
        gameId,
        onStatus: (s) => setStatus(s),
      });
      setRefundClaimed(true);
      setWithdrawableAmt(await readWithdrawable(account.address));
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  }

  async function onWithdraw() {
    setError(""); setBusy(true);
    try {
      const account = accounts.find((a) => a.address === selected) ?? accounts[0];
      if (!account) throw new Error("Connect a wallet first");
      await callWithdraw({
        signerAddress: account.address,
        signer: account.polkadotSigner as any,
        onStatus: (s) => setStatus(s),
      });
      setWithdrawableAmt(0n);
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  }

  if (!game) return <div className="text-sm text-muted-foreground">Loading game…</div>;

  const canBuy = game.state === 0 && game.ticketCount < game.maxTickets &&
    nowSec < Number(game.startTime);

  const myHashes = new Set(myTickets.map((t) => t.hash));
  const otherTickets = allTickets.filter((t) => !myHashes.has(t.hash));

  const polledMask = drawn.reduce((m, n) => m | (1n << BigInt(n - 1)), 0n);
  const rowComplete = (mask: bigint) => mask !== 0n && (mask & polledMask) === mask;
  const winRowFor = (t: TicketView): number | undefined => {
    const masks = [t.topRowMask, t.middleRowMask, t.bottomRowMask];
    for (const line of [0, 1, 2]) {
      const w = lineWinner(line);
      if (w && w.winner.toLowerCase() === t.owner.toLowerCase() && rowComplete(masks[line])) return line;
    }
    return undefined;
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      <div className="flex flex-col gap-4">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Game #{gameId.toString()}</CardTitle>
              <Badge>{STATE_LABELS[game.state]}</Badge>
            </div>
            <CardDescription>
              Hosted by {shortenAddress(game.host)} ·
              {" "}{game.ticketCount}/{game.maxTickets} tickets ·
              {" "}pot {formatPlanck(game.pot, CHAIN.decimals, CHAIN.symbol)} ·
              {" "}starts in <Countdown startTime={game.startTime} />
            </CardDescription>
          </CardHeader>
        </Card>

        <WinnerBanner
          topLine={lineWinner(0)}
          middleLine={lineWinner(1)}
          bottomLine={lineWinner(2)}
          fullhouse={snap?.finalWinner}
        />

        {(startOverdue || drawOverdue) && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">
                {startOverdue ? "The game hasn't started" : "Draws have stalled"}
              </CardTitle>
              <CardDescription>
                The draw worker seems to be down. Drawing is permissionless — anyone
                can {startOverdue ? "start the game" : "draw the next number"} from here.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <WalletStatus />
              <Button onClick={onDrawNumber} disabled={busy || !isReady || accounts.length === 0}>
                {startOverdue ? "Start game" : "Draw next number"}
              </Button>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader><CardTitle className="text-lg">Number board</CardTitle></CardHeader>
          <CardContent>
            <NumberBoard drawn={drawn} latest={drawn[drawn.length - 1]} />
          </CardContent>
        </Card>

        {accounts.length > 1 && (
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="text-muted-foreground">Account:</span>
            {accounts.map((a) => (
              <button
                key={a.address}
                onClick={() => setSelected(a.address)}
                className={`rounded border px-2 py-1 font-mono ${a.address === selected ? "border-primary" : "border-border"}`}
              >
                {a.name ?? shortenAddress(a.address)}
              </button>
            ))}
          </div>
        )}

        {canBuy && (
          <>
            <WalletStatus />
            <TicketGenerator
              gameId={gameId}
              ticketPrice={game.ticketPrice}
              tokenSymbol={CHAIN.symbol}
              decimals={CHAIN.decimals}
              disabled={busy || !isReady}
              onBuy={onBuy}
              boughtCount={myTickets.length}
            />
          </>
        )}

        {(myTickets.length > 0 || otherTickets.length > 0) && (
          <Card>
            <CardHeader>
              <div className="flex gap-1 rounded-md bg-muted/50 p-1 w-fit">
                <button
                  onClick={() => setTab("mine")}
                  className={cn(
                    "rounded-sm px-3 py-1 text-sm font-medium transition-colors",
                    tab === "mine" ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  My tickets ({myTickets.length})
                </button>
                <button
                  onClick={() => setTab("others")}
                  className={cn(
                    "rounded-sm px-3 py-1 text-sm font-medium transition-colors",
                    tab === "others" ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  Other tickets ({otherTickets.length})
                </button>
              </div>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-4">
              {tab === "mine" && myTickets.length === 0 && (
                <div className="text-sm text-muted-foreground">You have no tickets in this game yet.</div>
              )}
              {tab === "mine" && myTickets.map((t) => (
                <div key={t.hash} className="space-y-1">
                  <TicketGrid
                    grid={gridFromMasks(t.topRowMask, t.middleRowMask, t.bottomRowMask)}
                    polledNumbers={drawn}
                    highlightRow={winRowFor(t)}
                  />
                  <div className="text-xs text-muted-foreground font-mono">hash {shortenAddress(t.hash)}</div>
                </div>
              ))}
              {tab === "others" && otherTickets.length === 0 && (
                <div className="text-sm text-muted-foreground">No other tickets yet.</div>
              )}
              {tab === "others" && otherTickets.map((t) => (
                <div key={t.hash} className="space-y-1">
                  <TicketGrid
                    grid={gridFromMasks(t.topRowMask, t.middleRowMask, t.bottomRowMask)}
                    polledNumbers={drawn}
                    highlightRow={winRowFor(t)}
                    size="sm"
                  />
                  <div className="text-xs text-muted-foreground font-mono">{shortenAddress(t.owner)}</div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {snap?.noWinner && myTickets.length > 0 && !refundClaimed && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Game ended without a full house</CardTitle>
              <CardDescription>Claim the refund share for your {myTickets.length} ticket{myTickets.length > 1 ? "s" : ""} (settles to your withdrawable balance).</CardDescription>
            </CardHeader>
            <CardContent>
              <Button onClick={onRefund} disabled={busy}>Claim refund</Button>
            </CardContent>
          </Card>
        )}

        {withdrawable > 0n && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">You have winnings to withdraw</CardTitle>
              <CardDescription>
                Pull-payment ledger holds {formatPlanck(withdrawable, CHAIN.decimals, CHAIN.symbol)}.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button onClick={onWithdraw} disabled={busy}>
                Withdraw {formatPlanck(withdrawable, CHAIN.decimals, CHAIN.symbol)}
              </Button>
            </CardContent>
          </Card>
        )}

        {status && <div className="text-xs text-muted-foreground">tx: {status}</div>}
        {error  && <div className="text-sm text-destructive">{error}</div>}
      </div>

      <div className="lg:sticky lg:top-4 self-start">
        <ChatPanel gameId={gameId} disabled={ended} />
      </div>
    </div>
  );
}
