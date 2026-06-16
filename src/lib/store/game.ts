import { create } from "zustand";
import type { GameView, TicketView } from "@/lib/tambola/abi";

interface GameSnapshot {
  game?: GameView;
  drawn: number[];
  tickets: TicketView[];
  lineWinners: { line: number; winner: `0x${string}`; payout: bigint }[];
  finalWinner?: { winner: `0x${string}`; payout: bigint; host: `0x${string}`; hostFee: bigint };
  noWinner: boolean;
}

interface GameState {
  byId: Record<string, GameSnapshot>;
  bestBlock: bigint;
  setBestBlock: (n: bigint) => void;
  setGame: (id: bigint, snap: Partial<GameSnapshot>) => void;
  appendDrawn: (id: bigint, n: number) => void;
  appendLineWinner: (id: bigint, w: { line: number; winner: `0x${string}`; payout: bigint }) => void;
  setFinalWinner: (id: bigint, w: GameSnapshot["finalWinner"]) => void;
  setNoWinner: (id: bigint) => void;
  reset: (id: bigint) => void;
}

export const useGameStore = create<GameState>((set) => ({
  byId: {},
  bestBlock: 0n,
  setBestBlock: (bestBlock) => set({ bestBlock }),
  setGame: (id, patch) => set((s) => {
    const key = id.toString();
    const prev = s.byId[key] ?? { drawn: [], tickets: [], lineWinners: [], noWinner: false };
    return { byId: { ...s.byId, [key]: { ...prev, ...patch } } };
  }),
  appendDrawn: (id, n) => set((s) => {
    const key = id.toString();
    const prev = s.byId[key] ?? { drawn: [], tickets: [], lineWinners: [], noWinner: false };
    if (prev.drawn.includes(n)) return s;
    return { byId: { ...s.byId, [key]: { ...prev, drawn: [...prev.drawn, n] } } };
  }),
  appendLineWinner: (id, w) => set((s) => {
    const key = id.toString();
    const prev = s.byId[key] ?? { drawn: [], tickets: [], lineWinners: [], noWinner: false };
    if (prev.lineWinners.some((x) => x.line === w.line)) return s;
    return { byId: { ...s.byId, [key]: { ...prev, lineWinners: [...prev.lineWinners, w] } } };
  }),
  setFinalWinner: (id, w) => set((s) => {
    const key = id.toString();
    const prev = s.byId[key] ?? { drawn: [], tickets: [], lineWinners: [], noWinner: false };
    return { byId: { ...s.byId, [key]: { ...prev, finalWinner: w } } };
  }),
  setNoWinner: (id) => set((s) => {
    const key = id.toString();
    const prev = s.byId[key] ?? { drawn: [], tickets: [], lineWinners: [], noWinner: false };
    return { byId: { ...s.byId, [key]: { ...prev, noWinner: true } } };
  }),
  reset: (id) => set((s) => {
    const next = { ...s.byId };
    delete next[id.toString()];
    return { byId: next };
  }),
}));
