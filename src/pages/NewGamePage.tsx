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
    <div className="max-w-lg mx-auto">
      <Card>
        <CardHeader>
          <CardTitle>Schedule a Tambola game</CardTitle>
          <CardDescription>
            The contract computes the start block from the time you pick. Players can buy tickets until then.
            Game ends when someone hits a full house.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="start">Start time</Label>
            <Input id="start" type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="price">Ticket price ({CHAIN.symbol})</Label>
            <Input id="price" type="text" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} />
          </div>
          <div className="text-xs text-muted-foreground space-y-1">
            <div>Prize split: <b>15%</b> top line · <b>15%</b> middle line · <b>15%</b> bottom line · <b>50%</b> full house · <b>5%</b> host fee.</div>
            <div>Max 100 players. Numbers are drawn every ~24 s after start. Unclaimed line shares roll into the full house.</div>
          </div>
        </CardContent>
        <CardFooter className="flex-col items-stretch gap-2">
          <Button onClick={submit} disabled={busy || !isReady}>{busy ? `Working… ${status}` : "Create game"}</Button>
          <WalletStatus />
          {error && <div className="text-sm text-destructive">{error}</div>}
        </CardFooter>
      </Card>
    </div>
  );
}
