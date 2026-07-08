import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

import { TicketGrid, type TicketOverlay } from "@/components/TicketGrid";
import { NumberBoard } from "@/components/NumberBoard";
import { Countdown } from "@/components/Countdown";
import { TicketGenerator } from "@/components/TicketGenerator";
import { ChatPanel } from "@/components/ChatPanel";
import { EmojiRain } from "@/components/EmojiRain";
import { WalletStatus } from "@/components/WalletStatus";
import { WinnerBanner } from "@/components/WinnerBanner";
import { GameRules } from "@/components/GameRules";
import { TxStatusModal } from "@/components/TxStatusModal";

import { useAccounts } from "@/lib/chain/use-accounts";
import { useWalletStore } from "@/lib/store/wallet";
import { useDraftStore } from "@/lib/store/draft";
import { useGameStore } from "@/lib/store/game";
import { useChatStore } from "@/lib/store/chat";

import {
  readGame, readDrawnNumbers, readTickets, readTicketsByOwner, readIsRefundClaimed, readWithdrawable,
  readPrizeBps, type PrizeBps,
} from "@/lib/tambola/read";
import { callBuyTicket, callClaimRefund, callDrawNumber, callWithdraw, type TxStatus } from "@/lib/tambola/write";
import { subscribeEvents } from "@/lib/tambola/events";
import { lineWinnersFromGame, fullhousePrizesFromGame, winningTickets } from "@/lib/tambola/prize";
import { playNumber, stopPlayback } from "@/lib/sound";
import { useSoundStore } from "@/lib/store/sound";
import { gridFromMasks } from "@/lib/tambola/encode";
import { DRAW_INTERVAL_SECONDS, CHAIN } from "@/lib/chain/constants";
import { formatPlanck, shortenAddress, cn } from "@/lib/utils";
import { AddressLabel } from "@/components/AddressLabel";
import { hueFromSeed } from "@/lib/ticket-hues";
import { Coins, Volume2, VolumeX, Zap } from "lucide-react";

import type { TicketView } from "@/lib/tambola/abi";
import { STATE_LABELS, STATE_VARIANTS, CANCELLED_STATE, effectiveState } from "@/lib/tambola/state";

// How long past due a draw may be before we assume the worker is down and
// offer the player the permissionless drawNumber poke.
const WORKER_GRACE_SECONDS = 120;

export function GameView({ id }: { id: string }) {
  const gameId = BigInt(id);

  const { accounts, isReady } = useAccounts();
  const selected = useWalletStore((s) => s.selectedAddress) ?? accounts[0]?.address;

  const draft = useDraftStore((s) => s.byGame[gameId.toString()]);
  const clearDraft = useDraftStore((s) => s.clear);

  const snap = useGameStore((s) => s.byId[gameId.toString()]);
  const setGame = useGameStore((s) => s.setGame);
  const appendDrawn = useGameStore((s) => s.appendDrawn);
  const appendLineWinner = useGameStore((s) => s.appendLineWinner);
  const appendFinalWinner = useGameStore((s) => s.appendFinalWinner);
  const setNoWinner = useGameStore((s) => s.setNoWinner);

  const closeChat = useChatStore((s) => s.close);
  const soundMuted = useSoundStore((s) => s.muted);
  const toggleSound = useSoundStore((s) => s.toggle);

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
        if (g.state === 3) setNoWinner(gameId);
        const anyWinner = [g.topLineWinners, g.middleLineWinners, g.bottomLineWinners, g.fullhouseWinners]
          .some((w) => w.length > 0);
        if (anyWinner) {
          // Payouts are pure functions of pot + on-chain bps, so cold-load can
          // reconstruct them without scanning historical events.
          const bps = await readPrizeBps();
          if (cancel) return;
          for (const w of lineWinnersFromGame(g, bps)) appendLineWinner(gameId, w);
          for (const w of fullhousePrizesFromGame(g, bps)) appendFinalWinner(gameId, w);
        }
      } catch (e) { console.error(e); }
    })();
    return () => { cancel = true; };
  }, [gameId, setGame, appendLineWinner, appendFinalWinner, setNoWinner]);

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

  // Subscribe to Tambola contract events scoped to this game.
  useEffect(() => {
    let cancelled = false;
    let teardown: (() => void) | undefined;
    (async () => {
      const unsub = await subscribeEvents((e) => {
        const evId = (e.args as any).gameId as bigint | undefined;
        if (evId !== gameId) return;
        switch (e.name) {
          case "TicketBought":
            void refreshTickets();
            break;
          case "NumberDrawn": {
            const known = useGameStore.getState().byId[gameId.toString()]?.drawn.includes(e.args.number);
            appendDrawn(gameId, e.args.number);
            if (!known) void playNumber(e.args.number);
            break;
          }
          case "LineWon":
            appendLineWinner(gameId, { line: e.args.line, winner: e.args.winner, payout: e.args.payout });
            break;
          case "GameWon":
            appendFinalWinner(gameId, {
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
      // The await can outlive this effect (client connect takes seconds) — a
      // subscription landing after cleanup must be released, or it plays
      // sounds and burns a WS watcher for the rest of the session.
      if (cancelled) { unsub(); return; }
      teardown = unsub;
    })();
    return () => {
      cancelled = true;
      teardown?.();
      stopPlayback();
    };
  }, [gameId, selected, appendDrawn, appendLineWinner, appendFinalWinner, setNoWinner, setGame, closeChat, refreshTickets]);

  const game = snap?.game;
  const drawn = snap?.drawn ?? [];
  const ended = game?.state === 2 || game?.state === 3;
  const lineWinners = (line: number) => snap?.lineWinners.filter((w) => w.line === line) ?? [];

  // The worker normally pokes drawNumber, but it is permissionless — when the
  // worker misses its slot by WORKER_GRACE, let the player poke instead.
  const startOverdue = game?.state === 0 && game.ticketCount > 0 &&
    nowSec >= Number(game.startTime) + WORKER_GRACE_SECONDS;
  const drawOverdue = game?.state === 1 &&
    nowSec >= Number(game.lastDrawTime) + DRAW_INTERVAL_SECONDS + WORKER_GRACE_SECONDS;

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
      <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
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

  const winning = winningTickets(game, allTickets, drawn);
  const wonRowsFor = (t: TicketView): number[] =>
    [0, 1, 2].filter((line) => winning.lineTickets[line].includes(t.hash));
  const isFullhouseTicket = (t: TicketView): boolean => winning.fullhouseTickets.includes(t.hash);
  const lineNames = ["Top line", "Middle line", "Bottom line"];
  const overlayFor = (t: TicketView) => {
    const wins: TicketOverlay[] = wonRowsFor(t).map((r) => ({ label: `${lineNames[r]} winner`, kind: "line" }));
    if (isFullhouseTicket(t)) wins.push({ label: "Full house winner", kind: "fullhouse" as const });
    return wins.length > 0 ? wins : undefined;
  };

  const uiState = effectiveState(game, nowSec);

  const stats = [
    { label: "Pot", value: formatPlanck(game.pot, CHAIN.decimals, CHAIN.symbol), big: true },
    { label: "Tickets", value: `${game.ticketCount} / ${game.maxTickets}` },
    { label: "Ticket price", value: formatPlanck(game.ticketPrice, CHAIN.decimals, CHAIN.symbol) },
    { label: "Drawn", value: `${game.drawnCount.toString()} / 90` },
  ];

  return (
    <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
      <EmojiRain gameId={gameId} />
      <div className="flex flex-col gap-5">
        <div className="glass animate-rise rounded-3xl p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <h1 className="font-game text-2xl font-bold tracking-tight">Game #{gameId.toString()}</h1>
              <Badge variant={STATE_VARIANTS[uiState] ?? "outline"}>{STATE_LABELS[uiState]}</Badge>
            </div>
            <div className="flex items-center gap-2">
              <GameRules shares={prizeShares} />
              {uiState === 0 && (
                <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.06] px-4 py-1.5 backdrop-blur-xl">
                  <span className="text-xs text-muted-foreground">Starts in</span>
                  <Countdown startTime={game.startTime} className="text-sm" />
                </div>
              )}
            </div>
          </div>
          <div className="mt-1 text-xs text-muted-foreground">Hosted by <AddressLabel address={game.host} /></div>
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
          topLine={lineWinners(0)}
          middleLine={lineWinners(1)}
          bottomLine={lineWinners(2)}
          fullhouse={snap?.finalWinners ?? []}
        />

        {uiState === CANCELLED_STATE && (
          <div className="animate-rise rounded-3xl border border-white/10 bg-white/[0.03] p-6 backdrop-blur-2xl">
            <div className="text-lg font-semibold leading-tight">Game cancelled</div>
            <p className="mt-1.5 text-sm text-muted-foreground">
              No tickets were sold before the start time, so this game can never begin.
              Nothing was collected — there is nothing to refund.
            </p>
          </div>
        )}

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
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <CardTitle className="text-lg">Drawn numbers</CardTitle>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                aria-label={soundMuted ? "Unmute number call-outs" : "Mute number call-outs"}
                onClick={toggleSound}
              >
                {soundMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
              </Button>
            </CardHeader>
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
                    highlightRow={ended ? undefined : wonRowsFor(t)[0]}
                    struckRows={ended ? wonRowsFor(t) : undefined}
                    overlay={overlayFor(t)}
                    overlayMode="cover"
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
                    highlightRow={ended ? undefined : wonRowsFor(t)[0]}
                    struckRows={ended ? wonRowsFor(t) : undefined}
                    overlay={overlayFor(t)}
                    overlayMode="cover"
                    size="sm"
                    hue={hueFromSeed(t.hash)}
                  />
                  <div className="font-mono text-xs text-muted-foreground"><AddressLabel address={t.owner} /></div>
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

        {ended && withdrawable > 0n && (
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
