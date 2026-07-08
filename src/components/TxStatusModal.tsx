import * as Dialog from "@radix-ui/react-dialog";
import { Check, CircleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { TxStatus } from "@/lib/tambola/write";

interface Props {
  open: boolean;
  action: string;             // e.g. "Buying ticket"
  status: TxStatus | "";
  error?: string;
  onClose: () => void;        // dismiss — only offered once the tx has failed
}

const STEPS: { key: TxStatus; label: string }[] = [
  { key: "signing",     label: "Waiting for signature" },
  { key: "broadcasted", label: "Broadcasting" },
  { key: "in-block",    label: "In block" },
  { key: "finalized",   label: "Finalized" },
];

function Spinner() {
  return (
    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/20 border-t-white/80" />
  );
}

export function TxStatusModal({ open, action, status, error, onClose }: Props) {
  const failed = Boolean(error);
  const currentIdx = STEPS.findIndex((s) => s.key === status);

  return (
    <Dialog.Root open={open} onOpenChange={(next) => { if (!next && failed) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="animate-fade fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" />
        <Dialog.Content
          onEscapeKeyDown={(e) => { if (!failed) e.preventDefault(); }}
          onInteractOutside={(e) => { if (!failed) e.preventDefault(); }}
          onClick={(e) => { if (failed && e.target === e.currentTarget) onClose(); }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 focus:outline-none"
        >
          <div className="glass-strong animate-rise w-full max-w-sm rounded-3xl p-6">
          <Dialog.Title className="text-lg font-semibold leading-tight">
            {failed ? "Transaction failed" : action}
          </Dialog.Title>

          {failed ? (
            <>
              <Dialog.Description asChild>
                <div className="mt-3 flex items-start gap-2.5 rounded-2xl border border-red-400/25 bg-red-500/[0.07] p-4 text-sm text-red-200/90">
                  <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                  <span className="break-words [overflow-wrap:anywhere]">{error}</span>
                </div>
              </Dialog.Description>
              <Button onClick={onClose} variant="secondary" className="mt-5 w-full">Close</Button>
            </>
          ) : (
            <Dialog.Description asChild>
              <div className="mt-5 flex flex-col gap-3.5">
                {STEPS.map((step, i) => {
                  const state = i < currentIdx ? "done" : i === currentIdx ? "active" : "pending";
                  return (
                    <div key={step.key} className="flex items-center gap-3">
                      <span className="flex h-5 w-5 items-center justify-center">
                        {state === "done" && <Check className="h-4 w-4 text-[hsl(162_40%_58%)]" />}
                        {state === "active" && <Spinner />}
                        {state === "pending" && <span className="h-1.5 w-1.5 rounded-full bg-white/20" />}
                      </span>
                      <span
                        className={cn(
                          "text-sm transition-colors",
                          state === "active" ? "font-medium text-foreground" :
                          state === "done" ? "text-foreground/70" : "text-muted-foreground/60",
                        )}
                      >
                        {step.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            </Dialog.Description>
          )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
