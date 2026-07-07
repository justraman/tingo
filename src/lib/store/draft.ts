import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { generateTicket } from "@/lib/tambola/ticket";
import { encodeLayout, type TicketLayout } from "@/lib/tambola/encode";

// Holds only the not-yet-purchased draft per game. Bought tickets live on
// chain; their grids are reconstructed from the row masks (encode.ts).
interface Draft {
  grid: number[][];
  layout: TicketLayout;
}

interface DraftState {
  byGame: Record<string, Draft | undefined>;
  regenerate: (gameId: bigint) => void;
  clear: (gameId: bigint) => void;
}

export const useDraftStore = create<DraftState>()(
  persist(
    (set) => ({
      byGame: {},
      regenerate: (gameId) => {
        const grid   = generateTicket();
        const layout = encodeLayout(grid);
        set((s) => ({ byGame: { ...s.byGame, [gameId.toString()]: { grid, layout } } }));
      },
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
