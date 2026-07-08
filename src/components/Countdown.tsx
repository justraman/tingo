import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

interface Props {
  startTime: bigint;
  className?: string;
}

export function Countdown({ startTime, className }: Props) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const secsToGo = Number(startTime) - Math.floor(now / 1000);
  if (secsToGo <= 0) {
    return <span className={cn("font-semibold text-[hsl(162_40%_58%)]", className)}>live</span>;
  }

  const hours   = Math.floor(secsToGo / 3600);
  const minutes = Math.floor((secsToGo % 3600) / 60);
  const seconds = secsToGo % 60;

  return (
    <span className={cn("font-game font-semibold tabular-nums", className)}>
      {hours > 0 && `${String(hours).padStart(2, "0")}:`}
      {String(minutes).padStart(2, "0")}:{String(seconds).padStart(2, "0")}
    </span>
  );
}
