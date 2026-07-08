/**
 * Voice call-outs for drawn numbers. Clips are Vite-emitted assets loaded
 * lazily per number, so the 3 MB library never enters the main bundle.
 */

import { useSoundStore } from "@/lib/store/sound";

const clips = import.meta.glob("../assets/sound/*.mp3", {
  query: "?url",
  import: "default",
}) as Record<string, () => Promise<string>>;

let current: HTMLAudioElement | null = null;

export function stopPlayback(): void {
  current?.pause();
  current = null;
}

export async function playNumber(n: number): Promise<void> {
  if (useSoundStore.getState().muted) return;
  const load = clips[`../assets/sound/${n}.mp3`];
  if (!load) return;
  const url = await load();
  if (useSoundStore.getState().muted) return; // muted while the clip loaded
  stopPlayback();
  current = new Audio(url);
  // Autoplay may be blocked before the first user gesture — stay silent.
  await current.play().catch(() => {});
}

// Muting must also silence the clip already playing, not just future ones.
useSoundStore.subscribe((s) => {
  if (s.muted) stopPlayback();
});
