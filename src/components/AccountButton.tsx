import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Copy } from "lucide-react";
import { useAccounts } from "@/lib/chain/use-accounts";
import { useBalance } from "@/lib/chain/use-balance";
import { useWalletStore } from "@/lib/store/wallet";
import { getPrimaryUsername } from "@/lib/host/identity";
import { readWithdrawable } from "@/lib/tambola/read";
import { CHAIN } from "@/lib/chain/constants";
import { formatPlanck, shortenAddress, cn } from "@/lib/utils";

function compactPlanck(planck: bigint): string {
  const value = Number(planck) / 10 ** CHAIN.decimals;
  return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

interface ViewAccount {
  address: string;
  name?: string;
}

interface ViewProps {
  label: string;
  address: string;
  balance: bigint | null;
  winnings: bigint | null;
  accounts: ViewAccount[];
  onSelect: (address: string) => void;
  onOpen?: () => void;
}

/** Presentational pill + popover; `AccountButton` wires it to live data. */
export function AccountButtonView({ label, address, balance, winnings, accounts, onSelect, onOpen }: ViewProps) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    onOpen?.();
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
    // onOpen is intentionally read once per open, not a reactive dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function copyAddress() {
    await navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex h-9 cursor-pointer items-center gap-2 rounded-full border border-white/10 bg-white/[0.06] pl-3 pr-2.5 text-sm backdrop-blur-xl transition-colors hover:bg-white/[0.12]"
      >
        <span className="h-2 w-2 rounded-full bg-[hsl(162_40%_55%)]" />
        <span className="hidden max-w-32 truncate font-medium sm:inline">{label}</span>
        <span className="font-game font-semibold tabular-nums text-foreground/90">
          {balance === null ? "…" : compactPlanck(balance)} <span className="font-normal text-muted-foreground">{CHAIN.symbol}</span>
        </span>
        <ChevronDown className={cn("h-3.5 w-3.5 text-muted-foreground transition-transform duration-200", open && "rotate-180")} />
      </button>

      {open && (
        <div className="glass-strong animate-rise absolute right-0 top-full z-50 mt-2 w-80 rounded-2xl p-4">
          <div className="text-sm font-semibold">{label}</div>

          <button
            type="button"
            onClick={() => void copyAddress()}
            title="Copy address"
            className="glass-inset mt-2 flex w-full cursor-pointer items-center gap-2 rounded-xl p-2.5 text-left transition-colors hover:bg-white/[0.04]"
          >
            <span className="min-w-0 flex-1 break-all font-mono text-xs text-muted-foreground">
              {address}
            </span>
            {copied
              ? <Check className="h-4 w-4 shrink-0 text-[hsl(162_40%_58%)]" />
              : <Copy className="h-4 w-4 shrink-0 text-muted-foreground" />}
          </button>

          <div className="mt-3 flex items-baseline justify-between text-sm">
            <span className="text-muted-foreground">Balance</span>
            <span className="font-game font-semibold tabular-nums">
              {balance === null ? "…" : formatPlanck(balance, CHAIN.decimals, CHAIN.symbol)}
            </span>
          </div>
          {winnings !== null && winnings > 0n && (
            <div className="mt-1.5 flex items-baseline justify-between text-sm">
              <span className="text-muted-foreground">Winnings to withdraw</span>
              <span className="font-game font-semibold tabular-nums text-[hsl(var(--gold))]">
                {formatPlanck(winnings, CHAIN.decimals, CHAIN.symbol)}
              </span>
            </div>
          )}

          {accounts.length > 1 && (
            <div className="mt-3 border-t border-white/[0.07] pt-3">
              <div className="mb-1.5 text-[11px] font-medium uppercase tracking-widest text-muted-foreground">Accounts</div>
              <div className="flex flex-col gap-1">
                {accounts.map((a) => (
                  <button
                    key={a.address}
                    type="button"
                    onClick={() => { onSelect(a.address); setOpen(false); }}
                    className={cn(
                      "flex cursor-pointer items-center justify-between rounded-lg px-2.5 py-2 text-left text-sm transition-colors",
                      a.address === address
                        ? "bg-white/[0.1] text-foreground"
                        : "text-muted-foreground hover:bg-white/[0.05] hover:text-foreground",
                    )}
                  >
                    <span className="truncate">{a.name ?? shortenAddress(a.address, 6, 4)}</span>
                    {a.address === address && <Check className="h-3.5 w-3.5 shrink-0" />}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function AccountButton() {
  const { accounts, isReady } = useAccounts();
  const selected = useWalletStore((s) => s.selectedAddress) ?? accounts[0]?.address;
  const setSelected = useWalletStore((s) => s.setSelected);
  const account = accounts.find((a) => a.address === selected) ?? accounts[0];

  const balance = useBalance(account?.address);
  const [username, setUsername] = useState<string | null>(null);
  const [winnings, setWinnings] = useState<bigint | null>(null);

  useEffect(() => {
    void getPrimaryUsername().then(setUsername).catch(() => {});
  }, []);

  if (!isReady || !account) return null;

  return (
    <AccountButtonView
      label={username ?? account.name ?? shortenAddress(account.address, 4, 4)}
      address={account.address}
      balance={balance}
      winnings={winnings}
      accounts={accounts}
      onSelect={setSelected}
      onOpen={() => {
        readWithdrawable(account.address).then(setWinnings).catch(() => {});
      }}
    />
  );
}
