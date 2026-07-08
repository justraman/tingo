/** Dev-only style gallery (`#/preview`): renders every component with mock
    data so the design can be reviewed outside a host and without a chain. */

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { TicketGrid } from "@/components/TicketGrid";
import { NumberBoard } from "@/components/NumberBoard";
import { WinnerBanner } from "@/components/WinnerBanner";
import { GameRules } from "@/components/GameRules";
import { ChatPanel } from "@/components/ChatPanel";
import { TxStatusModal } from "@/components/TxStatusModal";
import { AccountButtonView } from "@/components/AccountButton";
import { useChatStore } from "@/lib/store/chat";
import { TICKET_HUES } from "@/lib/ticket-hues";
import type { TxStatus } from "@/lib/tambola/write";

const GRID = [
  [0, 12, 0, 34, 0, 56, 61, 0, 83],
  [4, 0, 27, 0, 45, 0, 68, 74, 0],
  [0, 18, 29, 0, 0, 58, 0, 79, 90],
];

const DRAWN = [12, 34, 45, 27, 90, 58, 5, 22, 74, 33, 41, 18, 83];
const ADDR = "0x1234567890abcdef1234567890abcdef12345678" as const;

const MOCK_CHAT_GAME = 999_999n;
const MOCK_CHAT = [
  { from: "5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY", name: "alice", text: "Good luck everyone! 🍀" },
  { from: "5FHneW46xGXgs5mUiveU4sbTyGBzmstUspZC92UhjJM694ty", name: "bob", text: "Two away from the top line already" },
  { from: "5FHneW46xGXgs5mUiveU4sbTyGBzmstUspZC92UhjJM694ty", name: "bob", text: "come on 61…" },
  { from: "5DAAnrj7VHTznn2AWBemMuyBwZWs6FNFjdyVXUeYum3PTXFy", text: "just joined, what did I miss?" },
  { from: "worker", name: "Tambola", text: "Number 83 drawn — 13 of 90." },
];

function useMockChat() {
  useEffect(() => {
    const store = useChatStore.getState();
    if ((store.byId[MOCK_CHAT_GAME.toString()] ?? []).length > 0) return;
    MOCK_CHAT.forEach((m) => store.append(MOCK_CHAT_GAME, { ...m, ts: Date.now() }));
  }, []);
}

export function PreviewPage() {
  useMockChat();
  const [txDemo, setTxDemo] = useState<{
    status: TxStatus | ""; error?: string; success?: { title: string; message: string };
  } | null>(null);

  useEffect(() => {
    if (!txDemo || txDemo.error || txDemo.success) return;
    if (txDemo.status === "finalized") {
      const t = setTimeout(() => setTxDemo(null), 1200);
      return () => clearTimeout(t);
    }
    const order: TxStatus[] = ["signing", "broadcasted", "in-block", "finalized"];
    const next = order[order.indexOf(txDemo.status as TxStatus) + 1];
    const t = setTimeout(() => setTxDemo({ status: next }), 1400);
    return () => clearTimeout(t);
  }, [txDemo]);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Design preview</h1>
        <p className="mt-1 text-sm text-muted-foreground">Mock data — dev only.</p>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-lg">Tickets — one per hue</CardTitle></CardHeader>
        <CardContent className="flex flex-wrap gap-5">
          {TICKET_HUES.map((hue, i) => (
            <TicketGrid
              key={hue.name}
              grid={GRID}
              polledNumbers={DRAWN}
              hue={hue}
              highlightRow={i === 2 ? 0 : undefined}
              overlay={i === 2 ? [{ label: "Top line winner", kind: "line" }] : undefined}
              overlayMode="ribbon"
            />
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-lg">Drawn numbers</CardTitle></CardHeader>
        <CardContent>
          <NumberBoard drawn={DRAWN} latest={DRAWN[DRAWN.length - 1]} />
        </CardContent>
      </Card>

      <WinnerBanner
        topLine={[
          { line: 0, winner: ADDR, payout: 75_000_000_000n },
          { line: 0, winner: "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd", payout: 75_000_000_000n },
        ]}
        middleLine={[{ line: 1, winner: ADDR, payout: 150_000_000_000n }]}
        bottomLine={[]}
        fullhouse={[{ winner: ADDR, payout: 500_000_000_000n, host: ADDR, hostFee: 50_000_000_000n }]}
      />

      <div className="h-[36rem]">
        <ChatPanel gameId={MOCK_CHAT_GAME} />
      </div>

      <Card>
        <CardHeader><CardTitle className="text-lg">Controls</CardTitle></CardHeader>
        <CardContent className="flex flex-col gap-5">
          <div className="flex flex-wrap items-center gap-3">
            <Button>Primary</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="outline">Outline</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="destructive">Destructive</Button>
            <Button disabled>Disabled</Button>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Badge>Default</Badge>
            <Badge variant="secondary">Starts soon</Badge>
            <Badge variant="live">Live</Badge>
            <Badge variant="success">Won</Badge>
            <Badge variant="outline">No winner</Badge>
          </div>
          <Input placeholder="Type a message…" className="max-w-sm" />
          <div className="flex justify-end">
            <AccountButtonView
              label="raman"
              address="5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY"
              balance={124_320_000_000n}
              winnings={5_000_000_000n}
              accounts={[
                { address: "5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY", name: "raman" },
                { address: "5FHneW46xGXgs5mUiveU4sbTyGBzmstUspZC92UhjJM694ty", name: "spare" },
              ]}
              onSelect={() => {}}
            />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="secondary" onClick={() => setTxDemo({ status: "signing" })}>Tx modal — progress</Button>
            <Button variant="secondary" onClick={() => setTxDemo({ status: "", error: "Wrong ticket price: expected 1 PAS, got 0.5 PAS (contract reverted)" })}>
              Tx modal — error
            </Button>
            <Button
              variant="secondary"
              onClick={() => setTxDemo({ status: "finalized", success: { title: "Ticket purchased", message: "Your ticket is in the game — good luck!" } })}
            >
              Tx modal — success
            </Button>
            <GameRules shares={{ lineBps: 1500, fullhouseBps: 5000, hostBps: 500 }} />
          </div>
        </CardContent>
      </Card>

      <TxStatusModal
        open={txDemo !== null}
        action="Buying ticket"
        status={txDemo?.status ?? ""}
        error={txDemo?.error}
        success={txDemo?.success}
        onClose={() => setTxDemo(null)}
      />
    </div>
  );
}
