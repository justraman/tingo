/**
 * In-memory router. The host only ever serves the root document and the URL
 * stays at `/` — the current route lives in app state, never in the URL. The
 * initial route is still seeded from any old-style deep link (hash, path, or
 * `/game?id=N`) so stale links land on the right page.
 */

import { create } from "zustand";
import type { AnchorHTMLAttributes, MouseEvent } from "react";

function normalize(raw: string): string {
  let path = raw.startsWith("/") ? raw : `/${raw}`;
  if (path.length > 1) path = path.replace(/\/+$/, "");
  return path;
}

function initialPath(): string {
  if (typeof window === "undefined") return "/";
  const { hash, pathname, search } = window.location;
  const fromHash = hash.replace(/^#/, "");
  const [rawPath, rawQuery = ""] = (fromHash || pathname).split("?");
  const path = normalize(rawPath || "/");
  const legacyId = new URLSearchParams(rawQuery || search).get("id");
  if (path === "/game" && legacyId) return `/game/${legacyId}`;
  return path;
}

const useRouteStore = create<{ path: string }>(() => ({ path: initialPath() }));

export function useRoute(): string {
  return useRouteStore((s) => s.path);
}

export function navigate(to: string) {
  useRouteStore.setState({ path: normalize(to) });
}

export function Link({
  href,
  onClick,
  ...rest
}: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) {
  return (
    <a
      {...rest}
      href={href}
      onClick={(e: MouseEvent<HTMLAnchorElement>) => {
        onClick?.(e);
        if (e.defaultPrevented) return;
        e.preventDefault();
        navigate(href);
      }}
    />
  );
}
