import type { GameView } from "./abi";

export const STATE_LABELS = ["Starts soon", "Live", "Won", "No winner", "Cancelled"];
export const STATE_VARIANTS: Record<number, "secondary" | "live" | "success" | "outline"> = {
  0: "secondary", 1: "live", 2: "success", 3: "outline", 4: "outline",
};

export const CANCELLED_STATE = 4;

// A Pending game whose start time passed with zero tickets can never start:
// drawNumber requires tickets and buying closes at startTime. The contract
// keeps it Pending forever, so "Cancelled" exists only as a display state.
export function effectiveState(
  g: Pick<GameView, "state" | "ticketCount" | "startTime">,
  nowSec: number,
): number {
  if (g.state === 0 && g.ticketCount === 0 && nowSec >= Number(g.startTime)) return CANCELLED_STATE;
  return g.state;
}
