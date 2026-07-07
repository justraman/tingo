import { cn } from "@/lib/utils";

interface Props {
  drawn: number[];
  latest?: number;
}

function DrawBall({ latest, recent }: { latest?: number; recent: number[] }) {
  return (
    <div className="flex items-center gap-5">
      <div className="relative h-24 w-24 shrink-0">
        {latest !== undefined && <div className="pulse-ring absolute inset-0 rounded-full" />}
        <div className="draw-ring absolute inset-0 rounded-full opacity-90" />
        <div className="absolute inset-[3px] rounded-full bg-[radial-gradient(circle_at_35%_30%,hsl(45_100%_72%),hsl(36_95%_52%)_60%,hsl(28_90%_42%))] shadow-[inset_0_-6px_12px_hsl(25_90%_30%/0.6)]" />
        <div className="absolute inset-[16px] flex items-center justify-center rounded-full bg-[radial-gradient(circle_at_40%_32%,white,hsl(40_30%_90%))] shadow-[inset_0_-3px_6px_hsl(35_40%_60%/0.5)]">
          {latest !== undefined ? (
            <span key={latest} className="font-game animate-ball-in text-3xl font-bold text-neutral-900 tabular-nums">
              {latest}
            </span>
          ) : (
            <span className="text-2xl font-bold text-neutral-400">–</span>
          )}
        </div>
      </div>
      <div className="min-w-0">
        <div className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
          {latest !== undefined ? "Latest draw" : "Waiting for first draw"}
        </div>
        {recent.length > 1 && (
          <div className="mt-2 flex items-center gap-1.5">
            {recent.slice(0, -1).reverse().map((n, i) => (
              <span
                key={n}
                style={{ opacity: 1 - i * 0.18 }}
                className="font-game flex h-8 w-8 items-center justify-center rounded-full border border-white/15 bg-white/[0.07] text-xs font-semibold text-white/90 tabular-nums backdrop-blur-xl"
              >
                {n}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function NumberBoard({ drawn, latest }: Props) {
  const drawnSet = new Set(drawn);
  const cells: number[] = [];
  for (let i = 1; i <= 90; i++) cells.push(i);

  return (
    <div className="flex flex-col gap-6">
      <DrawBall latest={latest} recent={drawn.slice(-6)} />
      <div className="grid grid-cols-10 gap-1.5">
        {cells.map((n) => {
          const isDrawn  = drawnSet.has(n);
          const isLatest = n === latest;
          return (
            <div
              key={n}
              className={cn(
                "font-game flex aspect-square items-center justify-center rounded-lg text-xs font-semibold tabular-nums transition-all duration-500",
                isLatest
                  ? "animate-glow scale-105 bg-[hsl(42_100%_62%)] text-black shadow-[inset_0_1px_0_hsl(0_0%_100%/0.5)]"
                  : isDrawn
                    ? "bg-white/[0.14] text-white shadow-[inset_0_1px_0_hsl(0_0%_100%/0.15)]"
                    : "bg-white/[0.03] text-white/25",
              )}
            >
              {n}
            </div>
          );
        })}
      </div>
    </div>
  );
}
