import { cn } from "@/lib/utils";

interface Props {
  drawn: number[];
  latest?: number;
}

export function NumberBoard({ drawn, latest }: Props) {
  const history = [...drawn].reverse();

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-5">
        <div key={latest ?? "none"} className={cn("relative h-24 w-24 shrink-0", latest !== undefined && "ripple-once")}>
          <div className="glass-strong absolute inset-0 rounded-full" />
          <div className="absolute inset-0 flex items-center justify-center">
            {latest !== undefined ? (
              <span className="font-game animate-number-in text-4xl font-bold tabular-nums text-foreground">
                {latest}
              </span>
            ) : (
              <span className="text-2xl font-semibold text-white/25">–</span>
            )}
          </div>
        </div>
        <div>
          <div className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
            {latest !== undefined ? "Latest draw" : "Waiting for first draw"}
          </div>
          {drawn.length > 0 && (
            <div className="font-game mt-1 text-sm font-semibold tabular-nums text-foreground/70">
              {drawn.length} <span className="font-normal text-muted-foreground">of 90 drawn</span>
            </div>
          )}
        </div>
      </div>

      {history.length > 1 && (
        <div className="flex flex-wrap gap-1.5">
          {history.slice(1).map((n, i) => (
            <span
              key={n}
              className={cn(
                "font-game flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/[0.05] text-xs font-semibold tabular-nums text-foreground/85",
                i === 0 && "animate-fade",
              )}
            >
              {n}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
