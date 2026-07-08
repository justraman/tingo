import { create } from "zustand";
import type { GameView, TicketView } from "@/lib/tambola/abi";
import type { FullhousePrize, LinePrize } from "@/lib/tambola/prize";

interface GameSnapshot {
  game?: GameView;
  drawn: number[];
  tickets: TicketView[];
  lineWinners: LinePrize[];        // one entry per winning ticket; splits repeat a line
  finalWinners: FullhousePrize[];  // one entry per full-house winner
  noWinner: boolean;
}

interface GameState {
  byId: Record<string, GameSnapshot>;
  setGame: (id: bigint, snap: Partial<GameSnapshot>) => void;
  appendDrawn: (id: bigint, n: number) => void;
  appendLineWinner: (id: bigint, w: LinePrize) => void;
  appendFinalWinner: (id: bigint, w: FullhousePrize) => void;
  setNoWinner: (id: bigint) => void;
  reset: (id: bigint) => void;
}

const EMPTY: GameSnapshot = { drawn: [], tickets: [], lineWinners: [], finalWinners: [], noWinner: false };

export const useGameStore = create<GameState>((set) => ({
  byId: {},
  setGame: (id, patch) => set((s) => {
    const key = id.toString();
    const prev = s.byId[key] ?? EMPTY;
    return { byId: { ...s.byId, [key]: { ...prev, ...patch } } };
  }),
  appendDrawn: (id, n) => set((s) => {
    const key = id.toString();
    const prev = s.byId[key] ?? EMPTY;
    if (prev.drawn.includes(n)) return s;
    return { byId: { ...s.byId, [key]: { ...prev, drawn: [...prev.drawn, n] } } };
  }),
  appendLineWinner: (id, w) => set((s) => {
    const key = id.toString();
    const prev = s.byId[key] ?? EMPTY;
    if (prev.lineWinners.some((x) => x.line === w.line && x.winner === w.winner)) return s;
    return { byId: { ...s.byId, [key]: { ...prev, lineWinners: [...prev.lineWinners, w] } } };
  }),
  appendFinalWinner: (id, w) => set((s) => {
    const key = id.toString();
    const prev = s.byId[key] ?? EMPTY;
    if (prev.finalWinners.some((x) => x.winner === w.winner)) return s;
    return { byId: { ...s.byId, [key]: { ...prev, finalWinners: [...prev.finalWinners, w] } } };
  }),
  setNoWinner: (id) => set((s) => {
    const key = id.toString();
    const prev = s.byId[key] ?? EMPTY;
    return { byId: { ...s.byId, [key]: { ...prev, noWinner: true } } };
  }),
  reset: (id) => set((s) => {
    const next = { ...s.byId };
    delete next[id.toString()];
    return { byId: next };
  }),
}));
