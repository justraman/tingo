import { create } from "zustand";

export interface ChatMessage {
  from: string;        // SS58 / H160 / "system" string from chat manager
  text: string;
  ts: number;          // local arrival timestamp in ms
}

interface ChatState {
  byId: Record<string, ChatMessage[]>;
  closed: Record<string, boolean>;
  append: (gameId: bigint, msg: ChatMessage) => void;
  close: (gameId: bigint) => void;
  clear: (gameId: bigint) => void;
}

export const useChatStore = create<ChatState>((set) => ({
  byId: {},
  closed: {},
  append: (gameId, msg) => set((s) => {
    const k = gameId.toString();
    const prev = s.byId[k] ?? [];
    return { byId: { ...s.byId, [k]: [...prev, msg] } };
  }),
  close: (gameId) => set((s) => ({ closed: { ...s.closed, [gameId.toString()]: true } })),
  clear: (gameId) => set((s) => {
    const k = gameId.toString();
    const nextBy = { ...s.byId }; delete nextBy[k];
    const nextClosed = { ...s.closed }; delete nextClosed[k];
    return { byId: nextBy, closed: nextClosed };
  }),
}));
