import type { CSSProperties } from "react";
import type { Vibe } from "@/lib/store/vibe";

/** Arcade colors each number by its decade (1–10, 11–20, …). Glass falls back
    to the ticket's paper hue (--th) and vintage stamps everything in --brand,
    so both leave --cell-hue unset. */
const ARCADE_DECADES = [
  "338 100% 59%", // 1–10   pink
  "188 100% 57%", // 11–20  cyan
  "46 100% 60%",  // 21–30  gold
  "154 90% 59%",  // 31–40  mint
  "268 100% 71%", // 41–50  purple
  "19 100% 62%",  // 51–60  orange
  "219 100% 65%", // 61–70  blue
  "320 100% 68%", // 71–80  magenta
  "79 100% 65%",  // 81–90  lime
] as const;

/** Inline style carrying --cell-hue for a drawn number, or undefined when the
    vibe wants the CSS default (ticket hue / stamp). */
export function cellHueStyle(vibe: Vibe, n: number): CSSProperties | undefined {
  if (vibe !== "arcade") return undefined;
  const hue = ARCADE_DECADES[Math.min(8, Math.floor((n - 1) / 10))];
  return { "--cell-hue": hue } as CSSProperties;
}
