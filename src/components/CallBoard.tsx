import { cn } from "@/lib/utils";
import { useVibe } from "@/lib/store/vibe";
import { cellHueStyle } from "@/lib/vibe-colors";

interface Props {
  drawn: number[];
  latest?: number;
}

/** The full 1–90 board, lit as numbers are called. Arcade colors lit numbers
    by decade; vintage stamps them. Only used in the arcade/vintage game view. */
export function CallBoard({ drawn, latest }: Props) {
  const vibe = useVibe();
  const called = new Set(drawn);

  return (
    <div className="flex flex-wrap justify-center gap-1.5">
      {Array.from({ length: 90 }, (_, i) => i + 1).map((n) => {
        const lit = called.has(n);
        return (
          <span
            key={n}
            style={lit ? cellHueStyle(vibe, n) : undefined}
            className={cn(
              "cell h-8 w-8 rounded-full text-xs",
              lit ? cn("cell-dab", n === latest && "cell-latest") : "bg-[var(--cell-empty)] text-[var(--ink-faint)]",
            )}
          >
            {n}
          </span>
        );
      })}
    </div>
  );
}
