import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@/styles/globals.css";
import { App } from "./App";

// Old path-form links (`/game/1/`) still arrive when a static server or dev
// server serves them; fold the path into the hash so the router picks it up.
const { pathname, search } = window.location;
if (pathname !== "/" && pathname !== "/index.html") {
  window.history.replaceState(null, "", `/#${pathname}${search}`);
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
