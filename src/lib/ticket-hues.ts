/** Colored-paper palette for tickets — the only saturated color in the app.
    Each entry is an `H S% L%` triple consumed as `hsl(var(--th) / a)`. */

export const TICKET_HUES = [
  { name: "terracotta", hsl: "14 58% 60%" },
  { name: "ochre",      hsl: "40 62% 58%" },
  { name: "jade",       hsl: "162 40% 52%" },
  { name: "steel",      hsl: "205 52% 60%" },
  { name: "amethyst",   hsl: "262 42% 65%" },
  { name: "rosewood",   hsl: "342 45% 62%" },
] as const;

export type TicketHue = (typeof TICKET_HUES)[number];

export function hueFromSeed(seed: string): TicketHue {
  let acc = 0;
  for (let i = 0; i < seed.length; i++) acc = (acc * 31 + seed.charCodeAt(i)) >>> 0;
  return TICKET_HUES[acc % TICKET_HUES.length];
}

export function hueFromGrid(grid: number[][]): TicketHue {
  const flat = grid.flat().reduce((a, n) => (a * 7 + n) >>> 0, 0);
  return TICKET_HUES[flat % TICKET_HUES.length];
}
