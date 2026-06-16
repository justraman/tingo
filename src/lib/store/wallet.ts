import { create } from "zustand";

interface WalletState {
  selectedAddress: string | null;
  setSelected: (addr: string | null) => void;
}

export const useWalletStore = create<WalletState>((set) => ({
  selectedAddress: null,
  setSelected: (selectedAddress) => set({ selectedAddress }),
}));
