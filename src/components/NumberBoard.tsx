import { cn } from "@/lib/utils";

interface Props {
  drawn: number[];
  latest?: number;
}

export function NumberBoard({ drawn, latest }: Props) {
  const drawnSet = new Set(drawn);
  const cells: number[] = [];
  for (let i = 1; i <= 90; i++) cells.push(i);

  return (
    <div className="grid grid-cols-10 gap-1">
      {cells.map((n) => {
        const isDrawn  = drawnSet.has(n);
        const isLatest = n === latest;
        return (
          <div
            key={n}
            className={cn(
              "flex h-8 items-center justify-center rounded text-xs font-medium border",
              isLatest
                ? "border-amber-400 bg-amber-300 text-black animate-pulse"
                : isDrawn
                  ? "border-emerald-500 bg-emerald-500/20 text-emerald-700 dark:text-emerald-300"
                  : "border-border bg-muted/30 text-muted-foreground",
            )}
          >
            {n}
          </div>
        );
      })}
    </div>
  );
}
