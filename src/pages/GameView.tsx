import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

import { TicketGrid } from "@/components/TicketGrid";
import { NumberBoard } from "@/components/NumberBoard";
import { Countdown } from "@/components/Countdown";
import { TicketGenerator } from "@/components/TicketGenerator";
import { ChatPanel } from "@/components/ChatPanel";
import { WalletStatus } from "@/components/WalletStatus";
import { WinnerBanner } from "@/components/WinnerBanner";
import { GameRules } from "@/components/GameRules";
import { TxStatusModal } from "@/components/TxStatusModal";

import { useAccounts } from "@/lib/chain/use-accounts";
import { useWalletStore } from "@/lib/store/wallet";
import { useDraftStore } from "@/lib/store/draft";
import { useGameStore } from "@/lib/store/game";
import { useChatStore } from "@/lib/store/chat";

import { getClient } from "@/lib/chain/client";
import {
  readGame, readDrawnNumbers, readTickets, readTicketsByOwner, readIsRefundClaimed, readWithdrawable,
  readPrizeBps, type PrizeBps,
} from "@/lib/tambola/read";
import { callBuyTicket, callClaimRefund, callDrawNumber, callWithdraw, type TxStatus } from "@/lib/tambola/write";
import { subscribeEvents } from "@/lib/tambola/events";
import { gridFromMasks } from "@/lib/tambola/encode";
import { BLOCK_TIME_SECONDS, BLOCKS_BETWEEN_DRAWS, CHAIN } from "@/lib/chain/constants";
import { formatPlanck, shortenAddress, cn } from "@/lib/utils";
import { hueFromSeed } from "@/lib/ticket-hues";
import { Coins, Zap } from "lucide-react";

import type { TicketView } from "@/lib/tambola/abi";

const STATE_LABELS = ["Starts soon", "Live", "Won", "No winner"];
const STATE_VARIANTS: Record<number, "secondary" | "live" | "success" | "outline"> = {
  0: "secondary", 1: "live", 2: "success", 3: "outline",
};

// How long past due a draw may be before we assume the worker is down and
// offer the player the permissionless drawNumber poke.
const WORKER_GRACE_SECONDS = 120;
const WORKER_GRACE_BLOCKS = BigInt(Math.ceil(WORKER_GRACE_SECONDS / BLOCK_TIME_SECONDS));

export function GameView({ id }: { id: string }) {
  const gameId = BigInt(id);

  const { accounts, isReady } = useAccounts();
  const selected = useWalletStore((s) => s.selectedAddress) ?? accounts[0]?.address;

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
  const [status, setStatus] = useState<TxStatus | "">("");
  const [action, setAction] = useState<string>("");
  const [busy,   setBusy]   = useState<boolean>(false);
  const [error,  setError]  = useState<string>("");
  const [success, setSuccess] = useState<{ title: string; message: string } | null>(null);
  const [nowSec, setNowSec] = useState(() => Math.floor(Date.now() / 1000));
  const [prizeShares, setPrizeShares] = useState<PrizeBps | undefined>();

  useEffect(() => {
    const t = setInterval(() => setNowSec(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    readPrizeBps().then(setPrizeShares).catch(() => { /* panel renders without shares */ });
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

  function beginTx(label: string) {
    setError(""); setSuccess(null); setStatus("signing"); setAction(label); setBusy(true);
  }

  async function onBuy() {
    beginTx("Buying ticket");
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
      setSuccess({ title: "Ticket purchased", message: "Your ticket is in the game — good luck!" });
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  }

  async function onDrawNumber() {
    beginTx("Drawing number");
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
    beginTx("Claiming refund");
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
    beginTx("Withdrawing winnings");
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

  if (!game) {
    return (
      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="flex flex-col gap-5">
          <div className="skeleton h-36 rounded-3xl" />
          <div className="skeleton h-96 rounded-3xl" />
        </div>
        <div className="skeleton h-96 rounded-3xl" />
      </div>
    );
  }

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

  const stats = [
    { label: "Pot", value: formatPlanck(game.pot, CHAIN.decimals, CHAIN.symbol), big: true },
    { label: "Tickets", value: `${game.ticketCount} / ${game.maxTickets}` },
    { label: "Ticket price", value: formatPlanck(game.ticketPrice, CHAIN.decimals, CHAIN.symbol) },
    { label: "Drawn", value: `${game.drawnCount.toString()} / 90` },
  ];

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_420px]">
      <div className="flex flex-col gap-5">
        <div className="glass animate-rise rounded-3xl p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <h1 className="font-game text-2xl font-bold tracking-tight">Game #{gameId.toString()}</h1>
              <Badge variant={STATE_VARIANTS[game.state] ?? "outline"}>{STATE_LABELS[game.state]}</Badge>
            </div>
            <div className="flex items-center gap-2">
              <GameRules shares={prizeShares} />
              {game.state === 0 && (
                <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.06] px-4 py-1.5 backdrop-blur-xl">
                  <span className="text-xs text-muted-foreground">Starts in</span>
                  <Countdown startTime={game.startTime} className="text-sm" />
                </div>
              )}
            </div>
          </div>
          <div className="mt-1 text-xs text-muted-foreground">Hosted by {shortenAddress(game.host)}</div>
          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {stats.map((s) => (
              <div key={s.label} className="glass-inset rounded-2xl px-4 py-3">
                <div className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground">{s.label}</div>
                <div className={cn("font-game mt-0.5 font-bold tabular-nums", s.big ? "text-xl text-[hsl(var(--gold))]" : "text-base")}>
                  {s.value}
                </div>
              </div>
            ))}
          </div>
        </div>

        <WinnerBanner
          topLine={lineWinner(0)}
          middleLine={lineWinner(1)}
          bottomLine={lineWinner(2)}
          fullhouse={snap?.finalWinner}
        />

        {(startOverdue || drawOverdue) && (
          <div className="animate-rise rounded-3xl border border-[hsl(var(--gold)/0.2)] bg-[hsl(var(--gold)/0.04)] p-6 backdrop-blur-2xl">
            <div className="flex items-center gap-2 text-lg font-semibold leading-tight">
              <Zap className="h-5 w-5 text-[hsl(var(--gold))]" />
              {startOverdue ? "The game hasn't started" : "Draws have stalled"}
            </div>
            <p className="mt-1.5 text-sm text-muted-foreground">
              The draw worker seems to be down. Drawing is permissionless — anyone
              can {startOverdue ? "start the game" : "draw the next number"} from here.
            </p>
            <Button onClick={onDrawNumber} disabled={busy || !isReady || accounts.length === 0} className="mt-4">
              {startOverdue ? "Start game" : "Draw next number"}
            </Button>
          </div>
        )}

        {game.state !== 0 && (
          <Card className="animate-rise" style={{ animationDelay: "80ms" }}>
            <CardHeader><CardTitle className="text-lg">Drawn numbers</CardTitle></CardHeader>
            <CardContent>
              <NumberBoard drawn={drawn} latest={drawn[drawn.length - 1]} />
            </CardContent>
          </Card>
        )}

        {canBuy && (
          <TicketGenerator
            gameId={gameId}
            ticketPrice={game.ticketPrice}
            tokenSymbol={CHAIN.symbol}
            decimals={CHAIN.decimals}
            disabled={busy || !isReady}
            onBuy={onBuy}
            boughtCount={myTickets.length}
          />
        )}
        {canBuy && <WalletStatus />}

        {(myTickets.length > 0 || otherTickets.length > 0) && (
          <Card className="animate-rise" style={{ animationDelay: "140ms" }}>
            <CardHeader>
              <div className="glass-inset flex w-fit gap-1 rounded-full p-1">
                {([["mine", `My tickets (${myTickets.length})`], ["others", `Other tickets (${otherTickets.length})`]] as const).map(([key, label]) => (
                  <button
                    key={key}
                    onClick={() => setTab(key)}
                    className={cn(
                      "cursor-pointer rounded-full px-4 py-1.5 text-sm font-medium transition-all",
                      tab === key
                        ? "bg-white/[0.14] text-foreground shadow-[inset_0_1px_0_hsl(0_0%_100%/0.15)]"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-5">
              {tab === "mine" && myTickets.length === 0 && (
                <div className="text-sm text-muted-foreground">You have no tickets in this game yet.</div>
              )}
              {tab === "mine" && myTickets.map((t) => (
                <div key={t.hash} className="animate-rise space-y-1.5">
                  <TicketGrid
                    grid={gridFromMasks(t.topRowMask, t.middleRowMask, t.bottomRowMask)}
                    polledNumbers={drawn}
                    highlightRow={winRowFor(t)}
                    hue={hueFromSeed(t.hash)}
                  />
                  <div className="font-mono text-xs text-muted-foreground">hash {shortenAddress(t.hash)}</div>
                </div>
              ))}
              {tab === "others" && otherTickets.length === 0 && (
                <div className="text-sm text-muted-foreground">No other tickets yet.</div>
              )}
              {tab === "others" && otherTickets.map((t) => (
                <div key={t.hash} className="animate-rise space-y-1.5">
                  <TicketGrid
                    grid={gridFromMasks(t.topRowMask, t.middleRowMask, t.bottomRowMask)}
                    polledNumbers={drawn}
                    highlightRow={winRowFor(t)}
                    size="sm"
                    hue={hueFromSeed(t.hash)}
                  />
                  <div className="font-mono text-xs text-muted-foreground">{shortenAddress(t.owner)}</div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {snap?.noWinner && myTickets.length > 0 && !refundClaimed && (
          <Card className="animate-rise">
            <CardHeader>
              <CardTitle className="text-lg">Game ended without a full house</CardTitle>
              <div className="text-sm text-muted-foreground">
                Claim the refund share for your {myTickets.length} ticket{myTickets.length > 1 ? "s" : ""} (settles to your withdrawable balance).
              </div>
            </CardHeader>
            <CardContent>
              <Button onClick={onRefund} disabled={busy}>Claim refund</Button>
            </CardContent>
          </Card>
        )}

        {withdrawable > 0n && (
          <div className="animate-rise rounded-3xl border border-[hsl(162_40%_52%/0.25)] bg-[hsl(162_40%_52%/0.05)] p-6 backdrop-blur-2xl">
            <div className="flex items-center gap-2 text-lg font-semibold leading-tight">
              <Coins className="h-5 w-5 text-[hsl(162_40%_58%)]" />
              You have winnings to withdraw
            </div>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Your balance holds {formatPlanck(withdrawable, CHAIN.decimals, CHAIN.symbol)}.
            </p>
            <Button onClick={onWithdraw} disabled={busy} className="mt-4">
              Withdraw {formatPlanck(withdrawable, CHAIN.decimals, CHAIN.symbol)}
            </Button>
          </div>
        )}

        <TxStatusModal
          open={busy || Boolean(error) || Boolean(success)}
          action={action}
          status={status}
          error={error}
          success={success ?? undefined}
          onClose={() => { setError(""); setSuccess(null); }}
        />
      </div>

      <div className="self-start lg:sticky lg:top-24 lg:h-[calc(100dvh-7.5rem)]">
        <ChatPanel gameId={gameId} disabled={ended} />
      </div>
    </div>
  );
}
