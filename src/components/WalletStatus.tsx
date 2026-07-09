import { Button } from "@/components/ui/button";
import { useAccounts } from "@/lib/chain/use-accounts";
import { Wallet } from "lucide-react";

/** Wallet-connection problem indicator + retry; renders nothing once a signer is available. */
export function WalletStatus() {
  const { isReady, accounts, status, error, connect } = useAccounts();

  if (isReady && accounts.length > 0) return null;
  if (isReady) {
    return <div className="text-sm text-[hsl(var(--destructive))]">Connected, but no wallet account is available.</div>;
  }
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl border border-[var(--line)] bg-[var(--fill)] px-4 py-2.5 text-sm text-muted-foreground backdrop-blur-xl">
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
