import { create } from "zustand";
import { getHostLocalStorage } from "@parity/product-sdk-host";
import { isHostAsync } from "@/lib/host/detect";

export const VIBES = ["glass", "arcade", "vintage"] as const;
export type Vibe = (typeof VIBES)[number];

export const VIBE_META: Record<Vibe, { label: string; blurb: string }> = {
  glass:   { label: "Mystic",  blurb: "Dark glass, muted hues" },
  arcade:  { label: "Arcade",  blurb: "Neon lights, big energy" },
  vintage: { label: "Vintage", blurb: "Paper housie parlour" },
};

// Persisted through the host's key-value store when inside a container, so the
// choice follows the user across devices — same mechanism as the chat username.
// A browser-localStorage copy is always kept as a synchronous pre-paint cache.
const KEY = "tambola:vibe";
const DEFAULT_VIBE: Vibe = "glass";

function isVibe(v: unknown): v is Vibe {
  return typeof v === "string" && (VIBES as readonly string[]).includes(v);
}

function paint(vibe: Vibe) {
  if (typeof document !== "undefined") document.documentElement.dataset.vibe = vibe;
}

function readCachedVibe(): Vibe | null {
  try {
    const v = localStorage.getItem(KEY);
    return isVibe(v) ? v : null;
  } catch {
    return null;
  }
}

async function hostStorage() {
  return (await isHostAsync()) ? await getHostLocalStorage() : null;
}

async function readStoredVibe(): Promise<Vibe | null> {
  const storage = await hostStorage();
  if (storage) {
    const v = (await storage.readString(KEY)).trim();
    if (isVibe(v)) return v;
    return readCachedVibe(); // host has none yet — honor a local pick from this device
  }
  return readCachedVibe();
}

async function writeStoredVibe(vibe: Vibe): Promise<void> {
  try { localStorage.setItem(KEY, vibe); } catch { /* private mode / unavailable */ }
  const storage = await hostStorage();
  if (storage) await storage.writeString(KEY, vibe);
}

/** Paint the cached vibe before React mounts so the first frame isn't the
    default. The authoritative value is loaded async by `hydrate()`. */
export function applyStoredVibe(): Vibe {
  const vibe = readCachedVibe() ?? DEFAULT_VIBE;
  paint(vibe);
  return vibe;
}

interface VibeState {
  vibe: Vibe;
  chosen: boolean;   // the user has explicitly picked a vibe (drives the first-run chooser)
  hydrated: boolean; // persistent storage has been read
  setVibe: (vibe: Vibe) => void;
  hydrate: () => Promise<void>;
}

export const useVibeStore = create<VibeState>((set) => ({
  vibe: readCachedVibe() ?? DEFAULT_VIBE,
  chosen: readCachedVibe() !== null,
  hydrated: false,
  setVibe: (vibe) => {
    paint(vibe);
    set({ vibe, chosen: true });
    void writeStoredVibe(vibe);
  },
  hydrate: async () => {
    const stored = await readStoredVibe();
    if (stored) { paint(stored); set({ vibe: stored, chosen: true, hydrated: true }); }
    else set({ hydrated: true });
  },
}));

export const useVibe = (): Vibe => useVibeStore((s) => s.vibe);
