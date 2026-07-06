"use client";

import { Button } from "@/components/ui/button";
import { useAccounts } from "@/lib/chain/use-accounts";

/** One-line wallet connection state + retry, shown wherever a signer gate disables actions. */
export function WalletStatus() {
  const { isReady, accounts, status, error, connect } = useAccounts();

  if (isReady && accounts.length > 0) {
    return (
      <div className="text-xs text-muted-foreground font-mono break-all">
        Account: {accounts[0].address}
      </div>
    );
  }
  if (isReady) {
    return <div className="text-sm text-destructive">Connected, but no wallet account is available.</div>;
  }
  return (
    <div className="text-sm text-muted-foreground flex items-center justify-between gap-2">
      <span>
        {status === "connecting"
          ? "Connecting to wallet…"
          : error
            ? `Wallet: ${error.message}`
            : "Wallet not connected."}
      </span>
      {status !== "connecting" && (
        <Button variant="outline" size="sm" onClick={() => void connect()}>Retry</Button>
      )}
    </div>
  );
}
