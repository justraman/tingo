import { useState } from "react";
import { navigate } from "@/lib/router";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useAccounts } from "@/lib/chain/use-accounts";
import { WalletStatus } from "@/components/WalletStatus";
import { TxStatusModal } from "@/components/TxStatusModal";
import { useWalletStore } from "@/lib/store/wallet";
import { callCreateGame, type TxStatus } from "@/lib/tambola/write";
import { parsePlanck } from "@/lib/utils";
import { CHAIN, DRAW_INTERVAL_SECONDS } from "@/lib/chain/constants";

function toDatetimeLocalValue(d: Date): string {
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

const PRIZE_SPLIT = [
  { label: "Top line", pct: 15, hsl: "14 58% 60%" },
  { label: "Middle line", pct: 15, hsl: "40 62% 58%" },
  { label: "Bottom line", pct: 15, hsl: "205 52% 60%" },
  { label: "Full house", pct: 50, hsl: "262 42% 65%" },
  { label: "Host fee", pct: 5, hsl: "240 6% 50%" },
];

function PrizeSplitBar() {
  return (
    <div>
      <div className="flex h-2.5 overflow-hidden rounded-full">
        {PRIZE_SPLIT.map((s) => (
          <div
            key={s.label}
            style={{ width: `${s.pct}%`, background: `hsl(${s.hsl})` }}
            title={`${s.label} ${s.pct}%`}
          />
        ))}
      </div>
      <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {PRIZE_SPLIT.map((s) => (
          <span key={s.label} className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ background: `hsl(${s.hsl})` }} />
            {s.label} <b className="text-foreground/80">{s.pct}%</b>
          </span>
        ))}
      </div>
    </div>
  );
}

export function NewGamePage() {
  const { accounts, isReady } = useAccounts();
  const selected = useWalletStore((s) => s.selectedAddress) ?? accounts[0]?.address;

  // datetime-local wants wall-clock local time; toISOString() would shift it to UTC.
  const defaultStart = toDatetimeLocalValue(new Date(Date.now() + 5 * 60 * 1000));
  const [start,  setStart]  = useState<string>(defaultStart);
  const [price,  setPrice]  = useState<string>("1");
  const [status, setStatus] = useState<TxStatus | "">("");
  const [busy,   setBusy]   = useState<boolean>(false);
  const [error,  setError]  = useState<string>("");

  async function submit() {
    setError(""); setStatus("signing"); setBusy(true);
    try {
      const account = accounts.find((a) => a.address === selected) ?? accounts[0];
      if (!account) throw new Error("No wallet account available");

      const startTs    = BigInt(Math.floor(new Date(start).getTime() / 1000));
      if (startTs <= BigInt(Math.floor(Date.now() / 1000))) {
        throw new Error("Start time must be in the future.");
      }
      const pricePlanck = parsePlanck(price, CHAIN.decimals);
      if (pricePlanck <= 0n) throw new Error("Ticket price must be greater than zero.");
      await callCreateGame({
        signerAddress: account.address,
        signer: account.polkadotSigner as any,
        startTimestampSec: startTs,
        ticketPrice: pricePlanck,
        onStatus: (s) => setStatus(s),
      });
      navigate("/");
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-lg">
      <Card className="animate-rise">
        <CardHeader>
          <CardTitle>Schedule a Tambola game</CardTitle>
          <CardDescription>
            The game starts at the time you pick. Players can buy tickets until then.
            Game ends when someone hits a full house.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="start">Start time</Label>
            <Input id="start" type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="price">Ticket price ({CHAIN.symbol})</Label>
            <Input id="price" type="text" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} />
          </div>
          <div className="glass-inset space-y-3 rounded-2xl p-4">
            <div className="text-xs font-medium uppercase tracking-widest text-muted-foreground">Prize split</div>
            <PrizeSplitBar />
            <div className="text-xs text-muted-foreground">
              Max 100 players. Numbers are drawn every {DRAW_INTERVAL_SECONDS} s after start. Unclaimed line shares roll into the full house.
            </div>
          </div>
        </CardContent>
        <CardFooter className="flex-col items-stretch gap-3">
          <Button onClick={submit} disabled={busy || !isReady} size="lg">Create game</Button>
          <WalletStatus />
        </CardFooter>
      </Card>
      <TxStatusModal
        open={busy || Boolean(error)}
        action="Creating game"
        status={status}
        error={error}
        onClose={() => setError("")}
      />
    </div>
  );
}
