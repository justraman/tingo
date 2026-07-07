import { Button } from "@/components/ui/button";
import { useAccounts } from "@/lib/chain/use-accounts";
import { shortenAddress } from "@/lib/utils";
import { Wallet } from "lucide-react";

/** One-line wallet connection state + retry, shown wherever a signer gate disables actions. */
export function WalletStatus() {
  const { isReady, accounts, status, error, connect } = useAccounts();

  if (isReady && accounts.length > 0) {
    return (
      <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.05] px-3 py-1.5 text-xs text-muted-foreground backdrop-blur-xl">
        <Wallet className="h-3.5 w-3.5 text-emerald-400" />
        <span className="font-mono">{shortenAddress(accounts[0].address, 8, 6)}</span>
      </div>
    );
  }
  if (isReady) {
    return <div className="text-sm text-red-400">Connected, but no wallet account is available.</div>;
  }
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-2.5 text-sm text-muted-foreground backdrop-blur-xl">
      <span className="inline-flex items-baseline gap-2">
        <Wallet className="h-3.5 w-3.5 shrink-0 self-center" />
        {status === "connecting"
          ? "Connecting to wallet…"
          : error
            ? `Wallet: ${error.message}`
            : "Wallet not connected."}
      </span>
      {status !== "connecting" && (
        <Button variant="ghost" size="sm" onClick={() => void connect()}>Retry</Button>
      )}
    </div>
  );
}
