"use client";

import { cn } from "@/lib/utils";

interface Props {
  grid: number[][];                 // 3 rows × 9 cols, 0 = empty
  polledNumbers?: number[];         // numbers already drawn — light them up
  highlightRow?: number;            // ring around the row that won (0/1/2)
  size?: "sm" | "md";
}

export function TicketGrid({ grid, polledNumbers = [], highlightRow, size = "md" }: Props) {
  const polled = new Set(polledNumbers);
  const cellBase =
    size === "sm"
      ? "h-7 w-7 text-xs"
      : "h-10 w-10 sm:h-12 sm:w-12 text-sm sm:text-base";

  return (
    <div className="inline-block rounded-md border bg-card p-1">
      {grid.map((row, r) => (
        <div
          key={r}
          className={cn(
            "flex gap-0.5",
            highlightRow === r && "rounded-sm ring-2 ring-emerald-500",
          )}
        >
          {row.map((v, c) => (
            <div
              key={c}
              className={cn(
                "flex items-center justify-center rounded-sm border font-semibold transition-colors",
                cellBase,
                v === 0
                  ? "border-transparent bg-muted/30"
                  : polled.has(v)
                    ? "border-emerald-500 bg-emerald-500/20 text-emerald-700 dark:text-emerald-300"
                    : "border-border bg-background",
              )}
            >
              {v === 0 ? "" : v}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
