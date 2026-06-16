"use client";

import { useEffect, useState } from "react";
import { CHAIN } from "@/lib/chain/constants";

interface Props {
  startBlock: bigint;
  currentBlock: bigint;
}

export function Countdown({ startBlock, currentBlock }: Props) {
  // Recompute every second so the seconds counter ticks even between blocks.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  if (currentBlock === 0n) return <span className="text-muted-foreground">syncing…</span>;
  if (currentBlock >= startBlock) return <span className="text-emerald-500 font-semibold">live</span>;

  const blocksToGo = Number(startBlock - currentBlock);
  const secsToGo   = blocksToGo * CHAIN.blockTimeSec;
  const minutes    = Math.floor(secsToGo / 60);
  const seconds    = secsToGo % 60;

  return (
    <span className="font-mono text-sm tabular-nums">
      {String(minutes).padStart(2, "0")}:{String(seconds).padStart(2, "0")}
      <span className="text-muted-foreground ml-2 text-xs">({blocksToGo} blocks)</span>
      {/* tiny hint that the value depends on `now` so React keeps the component subscribed */}
      <span className="hidden">{now}</span>
    </span>
  );
}
