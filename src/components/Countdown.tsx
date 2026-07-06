"use client";

import { useEffect, useState } from "react";

interface Props {
  startTime: bigint;
}

export function Countdown({ startTime }: Props) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const secsToGo = Number(startTime) - Math.floor(now / 1000);
  if (secsToGo <= 0) return <span className="text-emerald-500 font-semibold">live</span>;

  const minutes = Math.floor(secsToGo / 60);
  const seconds = secsToGo % 60;

  return (
    <span className="font-mono text-sm tabular-nums">
      {String(minutes).padStart(2, "0")}:{String(seconds).padStart(2, "0")}
    </span>
  );
}
