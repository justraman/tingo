"use client";

import { useEffect, useState } from "react";
import { ensureSignerConnected, signerManager } from "./signer";

export interface Account {
  address: string;
  publicKey: Uint8Array;
  name?: string;
  polkadotSigner: unknown;       // typed as `PolkadotSigner` by polkadot-api at the call site
}

export function useAccounts() {
  const [state, setState] = useState(() => signerManager.getState());

  useEffect(() => {
    const unsub = signerManager.subscribe(setState);
    void ensureSignerConnected();
    return unsub;
  }, []);

  const accounts: Account[] = (state.accounts ?? []) as Account[];
  const isReady =
    state.status === "connected" ? true :
    state.status === "error"     ? false :
    null;

  return {
    accounts,
    isLoading: isReady === null,
    isReady: isReady === true,
    error: state.error as Error | undefined,
    connect: ensureSignerConnected,
  };
}
