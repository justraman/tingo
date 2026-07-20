import { Button } from "@/components/ui/button";
import { useAccounts } from "@use-truapi/react";
import { Wallet } from "lucide-react";

/** Wallet-connection problem indicator + retry; renders nothing once a signer is available. */
export function WalletStatus() {
  const { isConnected, isConnecting, accounts, error, connect } = useAccounts();

  if (isConnected && accounts.length > 0) return null;
  if (isConnected) {
    return <div className="text-sm text-[hsl(var(--destructive))]">Connected, but no wallet account is available.</div>;
  }
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl border border-[var(--line)] bg-[var(--fill)] px-4 py-2.5 text-sm text-muted-foreground backdrop-blur-xl">
      <span className="inline-flex items-baseline gap-2">
        <Wallet className="h-3.5 w-3.5 shrink-0 self-center" />
        {isConnecting
          ? "Connecting to wallet…"
          : error
            ? `Wallet: ${error.message}`
            : "Wallet not connected."}
      </span>
      {!isConnecting && (
        <Button variant="ghost" size="sm" onClick={() => void connect().catch(() => {})}>Retry</Button>
      )}
    </div>
  );
}
