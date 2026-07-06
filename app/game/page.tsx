"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

import { TicketGrid } from "@/components/TicketGrid";
import { NumberBoard } from "@/components/NumberBoard";
import { Countdown } from "@/components/Countdown";
import { TicketGenerator } from "@/components/TicketGenerator";
import { ChatPanel } from "@/components/ChatPanel";
import { WinnerBanner } from "@/components/WinnerBanner";

import { useAccounts } from "@/lib/chain/use-accounts";
import { useWalletStore } from "@/lib/store/wallet";
import { useDraftStore } from "@/lib/store/draft";
import { useGameStore } from "@/lib/store/game";
import { useChatStore } from "@/lib/store/chat";

import { getClient } from "@/lib/chain/client";
import {
  readGame, readDrawnNumbers, readTicketByOwner, readIsRefundClaimed, readWithdrawable,
} from "@/lib/tambola/read";
import { callBuyTicket, callClaimRefund, callWithdraw } from "@/lib/tambola/write";
import { subscribeEvents } from "@/lib/tambola/events";
import { CHAIN } from "@/lib/chain/constants";
import { formatPlanck, shortenAddress } from "@/lib/utils";

import type { TicketView } from "@/lib/tambola/abi";

const STATE_LABELS = ["Pending", "Live", "Won", "NoWinner"];

export default function GamePageWrapper() {
  return (
    <Suspense fallback={<div className="text-sm text-muted-foreground">Loading…</div>}>
      <GamePage />
    </Suspense>
  );
}

function GamePage() {
  const search = useSearchParams();
  const idStr = search.get("id");
  if (!idStr) return <div className="text-sm text-destructive">Missing ?id= in URL.</div>;
  const gameId = BigInt(idStr);

  const { accounts, isReady } = useAccounts();
  const selected = useWalletStore((s) => s.selectedAddress) ?? accounts[0]?.address;
  const setSelected = useWalletStore((s) => s.setSelected);

  const draft = useDraftStore((s) => s.byGame[gameId.toString()]);
  const markBought = useDraftStore((s) => s.markBought);

  const snap = useGameStore((s) => s.byId[gameId.toString()]);
  const setBestBlock = useGameStore((s) => s.setBestBlock);
  const setGame = useGameStore((s) => s.setGame);
  const appendDrawn = useGameStore((s) => s.appendDrawn);
  const appendLineWinner = useGameStore((s) => s.appendLineWinner);
  const setFinalWinner = useGameStore((s) => s.setFinalWinner);
  const setNoWinner = useGameStore((s) => s.setNoWinner);

  const closeChat = useChatStore((s) => s.close);

  const [myTicket, setMyTicket] = useState<TicketView | null>(null);
  const [refundClaimed, setRefundClaimed] = useState<boolean>(false);
  const [withdrawable, setWithdrawableAmt] = useState<bigint>(0n);
  const [status, setStatus] = useState<string>("");
  const [busy,   setBusy]   = useState<boolean>(false);
  const [error,  setError]  = useState<string>("");

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

  // My ticket + my withdrawable whenever wallet changes.
  useEffect(() => {
    if (!selected) { setMyTicket(null); setWithdrawableAmt(0n); return; }
    let cancel = false;
    (async () => {
      try {
        const [id, ticket] = await readTicketByOwner(gameId, selected as `0x${string}`);
        if (cancel) return;
        setMyTicket(id > 0n ? ticket : null);
        if (snap?.noWinner) setRefundClaimed(await readIsRefundClaimed(gameId, selected as `0x${string}`));
        setWithdrawableAmt(await readWithdrawable(selected as `0x${string}`));
      } catch (e) { console.error(e); }
    })();
    return () => { cancel = true; };
  }, [gameId, selected, snap?.noWinner]);

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
          readWithdrawable(selected as `0x${string}`).then(setWithdrawableAmt).catch(() => {});
        }
      });
    })();
    return () => { teardown?.(); };
  }, [gameId, selected, appendDrawn, appendLineWinner, setFinalWinner, setNoWinner, setGame, closeChat]);

  const game = snap?.game;
  const drawn = snap?.drawn ?? [];
  const ended = game?.state === 2 || game?.state === 3;
  const lineWinner = (line: number) => snap?.lineWinners.find((w) => w.line === line);

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
      markBought(gameId);
      const [id, t] = await readTicketByOwner(gameId, account.address as `0x${string}`);
      setMyTicket(id > 0n ? t : null);
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
      setWithdrawableAmt(await readWithdrawable(account.address as `0x${string}`));
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

  const myRowHighlight =
    lineWinner(0)?.winner.toLowerCase() === (selected ?? "").toLowerCase() ? 0 :
    lineWinner(1)?.winner.toLowerCase() === (selected ?? "").toLowerCase() ? 1 :
    lineWinner(2)?.winner.toLowerCase() === (selected ?? "").toLowerCase() ? 2 :
    undefined;

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
              {" "}{game.playerCount}/{game.maxPlayers} players ·
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

        {!myTicket && game.state === 0 && (
          <TicketGenerator
            gameId={gameId}
            ticketPrice={game.ticketPrice}
            tokenSymbol={CHAIN.symbol}
            decimals={CHAIN.decimals}
            disabled={busy || !isReady}
            onBuy={onBuy}
          />
        )}

        {myTicket && draft && (
          <Card>
            <CardHeader><CardTitle className="text-lg">Your ticket</CardTitle></CardHeader>
            <CardContent>
              <TicketGrid grid={draft.grid} polledNumbers={drawn} highlightRow={myRowHighlight} />
              <div className="mt-2 text-xs text-muted-foreground font-mono">hash {shortenAddress(myTicket.hash)}</div>
            </CardContent>
          </Card>
        )}

        {myTicket && !draft && (
          <Card>
            <CardHeader><CardTitle className="text-lg">Your ticket</CardTitle></CardHeader>
            <CardContent>
              <div className="text-sm text-muted-foreground">
                Ticket exists on chain (hash {shortenAddress(myTicket.hash)}). The grid layout is kept in
                this browser's local storage — open this page from the same device that bought the ticket
                to see the cells light up as numbers are drawn.
              </div>
            </CardContent>
          </Card>
        )}

        {snap?.noWinner && myTicket && !refundClaimed && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Game ended without a full house</CardTitle>
              <CardDescription>Claim your refund share (settles to your withdrawable balance).</CardDescription>
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
