import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { generateTicket } from "@/lib/tambola/ticket";
import { encodeLayout, type TicketLayout } from "@/lib/tambola/encode";

interface PerGame {
  grid: number[][];
  layout: TicketLayout;
  bought: boolean;
}

interface DraftState {
  byGame: Record<string, PerGame | undefined>;
  regenerate: (gameId: bigint) => void;
  markBought: (gameId: bigint) => void;
  current: (gameId: bigint) => PerGame | undefined;
  clear: (gameId: bigint) => void;
}

export const useDraftStore = create<DraftState>()(
  persist(
    (set, get) => ({
      byGame: {},
      regenerate: (gameId) => {
        const grid   = generateTicket();
        const layout = encodeLayout(grid);
        set((s) => ({ byGame: { ...s.byGame, [gameId.toString()]: { grid, layout, bought: false } } }));
      },
      markBought: (gameId) => {
        const key = gameId.toString();
        const cur = get().byGame[key];
        if (!cur) return;
        set((s) => ({ byGame: { ...s.byGame, [key]: { ...cur, bought: true } } }));
      },
      current: (gameId) => get().byGame[gameId.toString()],
      clear: (gameId) => set((s) => {
        const next = { ...s.byGame }; delete next[gameId.toString()];
        return { byGame: next };
      }),
    }),
    {
      name: "tambola-drafts",
      storage: createJSONStorage(() => localStorage),
    },
  ),
);
