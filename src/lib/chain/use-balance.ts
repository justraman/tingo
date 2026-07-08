import { useEffect, useState } from "react";
import { watchFreeBalance } from "./balance";

/** Live free balance of `address` in planck; null while loading / no address. */
export function useBalance(address: string | undefined): bigint | null {
  const [balance, setBalance] = useState<bigint | null>(null);

  useEffect(() => {
    setBalance(null);
    if (!address) return;
    return watchFreeBalance(address, setBalance);
  }, [address]);

  return balance;
}
