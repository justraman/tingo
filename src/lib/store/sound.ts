import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

interface SoundState {
  muted: boolean;
  toggle: () => void;
}

export const useSoundStore = create<SoundState>()(
  persist(
    (set) => ({
      muted: false,
      toggle: () => set((s) => ({ muted: !s.muted })),
    }),
    {
      name: "tambola-sound",
      storage: createJSONStorage(() => localStorage),
    },
  ),
);
