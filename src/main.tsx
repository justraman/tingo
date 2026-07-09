import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@/styles/fonts.css";
import "@/styles/globals.css";
import { applyStoredVibe, useVibeStore } from "@/lib/store/vibe";
import { App } from "./App";

applyStoredVibe();
void useVibeStore.getState().hydrate();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
