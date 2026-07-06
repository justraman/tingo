"use client";

// Legacy `/game?id=N` links redirect to the canonical `/game/N/` route.

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export default function LegacyGameRedirectWrapper() {
  return (
    <Suspense fallback={<div className="text-sm text-muted-foreground">Loading…</div>}>
      <LegacyGameRedirect />
    </Suspense>
  );
}

function LegacyGameRedirect() {
  const router = useRouter();
  const idStr = useSearchParams().get("id");

  useEffect(() => {
    router.replace(idStr ? `/game/${idStr}/` : "/");
  }, [router, idStr]);

  return <div className="text-sm text-muted-foreground">Redirecting…</div>;
}
