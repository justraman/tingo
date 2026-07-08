import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { BookOpen, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PrizeBps } from "@/lib/tambola/read";

// Five filled cells per row, matching real ticket density.
const SHAPE = [
  [1, 0, 1, 0, 1, 0, 1, 0, 1],
  [0, 1, 0, 1, 1, 0, 1, 1, 0],
  [1, 0, 1, 1, 0, 1, 0, 0, 1],
];

interface Win {
  label: string;
  hint: string;
  rows: number[];
  share: (bps: PrizeBps) => number;
}

const WINS: Win[] = [
  { label: "Top line",    hint: "All 5 numbers in the top row",    rows: [0],       share: (b) => b.lineBps },
  { label: "Middle line", hint: "All 5 numbers in the middle row", rows: [1],       share: (b) => b.lineBps },
  { label: "Bottom line", hint: "All 5 numbers in the bottom row", rows: [2],       share: (b) => b.lineBps },
  { label: "Full house",  hint: "All 15 numbers on the ticket",    rows: [0, 1, 2], share: (b) => b.fullhouseBps },
];

const pct = (bps: number) => `${bps % 100 === 0 ? bps / 100 : (bps / 100).toFixed(2)}%`;

function PatternGrid({ winRows }: { winRows: number[] }) {
  const rows = new Set(winRows);
  return (
    <div className="flex flex-col gap-[3px]">
      {SHAPE.map((row, r) => (
        <div key={r} className="flex gap-[3px]">
          {row.map((filled, c) => (
            <span
              key={c}
              className={cn(
                "h-3 w-3 rounded-[3px]",
                !filled
                  ? "bg-white/[0.04]"
                  : rows.has(r)
                    ? "bg-[hsl(var(--gold)/0.8)] shadow-[0_0_8px_hsl(var(--gold)/0.35)]"
                    : "bg-white/[0.1]",
              )}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

export function GameRules({ shares, className }: { shares?: PrizeBps; className?: string }) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.06] px-4 py-1.5 text-xs font-medium text-muted-foreground backdrop-blur-xl transition-colors hover:bg-white/[0.1] hover:text-foreground",
            className,
          )}
        >
          <BookOpen className="h-3.5 w-3.5" />
          Rules
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="animate-fade fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" />
        <Dialog.Content className="fixed inset-0 z-50 flex items-center justify-center p-4 focus:outline-none">
          <div className="glass-strong animate-rise w-full max-w-2xl rounded-3xl p-6">
            <div className="flex items-center justify-between">
              <Dialog.Title className="text-lg font-semibold leading-tight">Ways to win</Dialog.Title>
              <Dialog.Close asChild>
                <button
                  type="button"
                  aria-label="Close"
                  className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-white/[0.08] hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              </Dialog.Close>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {WINS.map((w) => (
                <div key={w.label} className="glass-inset flex flex-col items-center gap-3 rounded-2xl px-3 py-4">
                  <PatternGrid winRows={w.rows} />
                  <div className="text-center">
                    <div className="text-sm font-semibold leading-tight">{w.label}</div>
                    <div className="mt-0.5 text-[11px] leading-snug text-muted-foreground">{w.hint}</div>
                    {shares && (
                      <div className="font-game mt-1.5 text-xs font-bold text-[hsl(var(--gold))]">
                        {pct(w.share(shares))} of pot
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <Dialog.Description asChild>
              <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
                Each prize goes to the first ticket to complete it. Line prizes nobody wins
                roll into the full house
                {shares ? <>, and the host earns {pct(shares.hostBps)}</> : null}.
              </p>
            </Dialog.Description>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
