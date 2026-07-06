import { GameView } from "./GameView";

// Static export can't materialize unbounded ids, so the first
// MAX_PRERENDERED_GAMES sequential game ids get a page. Bump and redeploy when
// the deployment outgrows it.
const MAX_PRERENDERED_GAMES = 128;

export const dynamicParams = false;

export function generateStaticParams() {
  return Array.from({ length: MAX_PRERENDERED_GAMES }, (_, i) => ({ id: i.toString() }));
}

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <GameView id={id} />;
}
