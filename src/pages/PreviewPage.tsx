/** Dev-only style gallery (`#/preview`): renders every component with mock
    data so the design can be reviewed outside a host and without a chain. */

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { TicketGrid } from "@/components/TicketGrid";
import { NumberBoard } from "@/components/NumberBoard";
import { WinnerBanner } from "@/components/WinnerBanner";
import { TICKET_HUES } from "@/lib/ticket-hues";

const GRID = [
  [0, 12, 0, 34, 0, 56, 61, 0, 83],
  [4, 0, 27, 0, 45, 0, 68, 74, 0],
  [0, 18, 29, 0, 0, 58, 0, 79, 90],
];

const DRAWN = [12, 34, 45, 27, 90, 58, 5, 22, 74, 33, 41, 18, 83];
const ADDR = "0x1234567890abcdef1234567890abcdef12345678" as const;

export function PreviewPage() {
  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Design preview</h1>
        <p className="mt-1 text-sm text-muted-foreground">Mock data — dev only.</p>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-lg">Tickets — one per hue</CardTitle></CardHeader>
        <CardContent className="flex flex-wrap gap-5">
          {TICKET_HUES.map((hue, i) => (
            <TicketGrid key={hue.name} grid={GRID} polledNumbers={DRAWN} hue={hue} highlightRow={i === 2 ? 0 : undefined} />
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-lg">Number board</CardTitle></CardHeader>
        <CardContent>
          <NumberBoard drawn={DRAWN} latest={DRAWN[DRAWN.length - 1]} />
        </CardContent>
      </Card>

      <WinnerBanner
        topLine={{ winner: ADDR, payout: 150_000_000_000n }}
        middleLine={{ winner: ADDR, payout: 150_000_000_000n }}
        fullhouse={{ winner: ADDR, payout: 500_000_000_000n, host: ADDR, hostFee: 50_000_000_000n }}
      />

      <Card>
        <CardHeader><CardTitle className="text-lg">Controls</CardTitle></CardHeader>
        <CardContent className="flex flex-col gap-5">
          <div className="flex flex-wrap items-center gap-3">
            <Button>Primary</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="outline">Outline</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="destructive">Destructive</Button>
            <Button disabled>Disabled</Button>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Badge>Default</Badge>
            <Badge variant="secondary">Starts soon</Badge>
            <Badge variant="live">Live</Badge>
            <Badge variant="success">Won</Badge>
            <Badge variant="outline">No winner</Badge>
          </div>
          <Input placeholder="Type a message…" className="max-w-sm" />
        </CardContent>
      </Card>
    </div>
  );
}
