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

  const accounts: Account[] = (state.accounts ?? []).map((a) => ({
    address: a.address,
    publicKey: a.publicKey,
    name: a.name ?? undefined,
    polkadotSigner: a.getSigner(),
  }));
  const isReady =
    state.status === "connected" ? true :
    state.error != null          ? false :
    null;

  return {
    accounts,
    status: state.status,
    isLoading: isReady === null,
    isReady: isReady === true,
    error: state.error ?? undefined,
    connect: ensureSignerConnected,
  };
}
