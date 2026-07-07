import { useState } from "react";
import { navigate } from "@/lib/router";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useAccounts } from "@/lib/chain/use-accounts";
import { WalletStatus } from "@/components/WalletStatus";
import { useWalletStore } from "@/lib/store/wallet";
import { callCreateGame } from "@/lib/tambola/write";
import { parsePlanck } from "@/lib/utils";
import { CHAIN } from "@/lib/chain/constants";

function toDatetimeLocalValue(d: Date): string {
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

const PRIZE_SPLIT = [
  { label: "Top line", pct: 15, hsl: "347 89% 61%" },
  { label: "Middle line", pct: 15, hsl: "38 95% 56%" },
  { label: "Bottom line", pct: 15, hsl: "199 92% 56%" },
  { label: "Full house", pct: 50, hsl: "258 88% 68%" },
  { label: "Host fee", pct: 5, hsl: "0 0% 65%" },
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
  const [status, setStatus] = useState<string>("");
  const [busy,   setBusy]   = useState<boolean>(false);
  const [error,  setError]  = useState<string>("");

  async function submit() {
    setError(""); setStatus(""); setBusy(true);
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
            The contract computes the start block from the time you pick. Players can buy tickets until then.
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
              Max 100 players. Numbers are drawn every ~24 s after start. Unclaimed line shares roll into the full house.
            </div>
          </div>
        </CardContent>
        <CardFooter className="flex-col items-stretch gap-3">
          <Button onClick={submit} disabled={busy || !isReady} size="lg">
            {busy ? `Working… ${status}` : "Create game"}
          </Button>
          <WalletStatus />
          {error && <div className="text-sm text-red-400">{error}</div>}
        </CardFooter>
      </Card>
    </div>
  );
}
