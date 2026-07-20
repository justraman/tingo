import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { TruapiProvider, createTruapiQueryClient } from "@use-truapi/react";
import "@/styles/fonts.css";
import "@/styles/globals.css";
import { truapi } from "@/lib/truapi";
import { applyStoredVibe, useVibeStore } from "@/lib/store/vibe";
import { App } from "./App";

applyStoredVibe();
void useVibeStore.getState().hydrate();

const queryClient = createTruapiQueryClient();
if (import.meta.env.DEV) (window as { __queryClient?: unknown }).__queryClient = queryClient;

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <TruapiProvider runtime={truapi} queryClient={queryClient}>
      <App />
    </TruapiProvider>
  </StrictMode>,
);
