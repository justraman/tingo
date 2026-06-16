import type { Metadata } from "next";
import "@/styles/globals.css";

export const metadata: Metadata = {
  title: "Tambola — Polkadot",
  description: "On-chain Indian Bingo, ticket fairness verified on Asset Hub.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-background text-foreground antialiased">
        <header className="border-b">
          <div className="container flex h-14 items-center justify-between">
            <a href="/" className="font-bold tracking-tight text-lg">🎯 Tambola</a>
            <a href="/host/new" className="text-sm text-muted-foreground hover:text-foreground">Host a game</a>
          </div>
        </header>
        <main className="container py-6">{children}</main>
      </body>
    </html>
  );
}
