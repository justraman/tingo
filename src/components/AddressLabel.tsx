import { useEffect, useState } from "react";
import { isValidH160 } from "@use-truapi/core";
import { resolveOriginalSs58 } from "@/lib/chain/original-account";
import { shortenAddress } from "@/lib/utils";

/** Contract-side H160s resolve to their registered SS58 through
 *  `Revive.OriginalAccount`; the raw H160 shows while resolving or for
 *  addresses that were never mapped. */
export function AddressLabel({ address, head = 6, tail = 4 }: { address: string; head?: number; tail?: number }) {
  const [ss58, setSs58] = useState<string | null>(null);

  useEffect(() => {
    setSs58(null);
    if (!isValidH160(address)) return;
    let cancel = false;
    resolveOriginalSs58(address)
      .then((resolved) => { if (!cancel) setSs58(resolved); })
      .catch(() => {});
    return () => { cancel = true; };
  }, [address]);

  return <>{shortenAddress(ss58 ?? address, head, tail)}</>;
}
