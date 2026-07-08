import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useAccounts } from "@/lib/chain/use-accounts";
import { shortenAddress } from "@/lib/utils";
import { Check, Wallet } from "lucide-react";

/** One-line wallet connection state + retry, shown wherever a signer gate disables actions. */
export function WalletStatus() {
  const { isReady, accounts, status, error, connect } = useAccounts();
  const [copied, setCopied] = useState(false);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  if (isReady && accounts.length > 0) {
    const address = accounts[0].address;
    const copyAddress = async () => {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      clearTimeout(copiedTimer.current);
      copiedTimer.current = setTimeout(() => setCopied(false), 1500);
    };
    return (
      <button
        type="button"
        onClick={() => void copyAddress()}
        title={`${address} — click to copy`}
        className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-white/10 bg-white/[0.05] px-3 py-1.5 text-xs text-muted-foreground backdrop-blur-xl transition-colors hover:bg-white/[0.1]"
      >
        {copied
          ? <Check className="h-3.5 w-3.5 text-[hsl(162_40%_58%)]" />
          : <Wallet className="h-3.5 w-3.5 text-[hsl(162_40%_58%)]" />}
        <span className="font-mono">{copied ? "Copied" : shortenAddress(address, 8, 6)}</span>
      </button>
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
