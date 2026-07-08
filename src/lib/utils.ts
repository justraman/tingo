import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { h160ToSs58, isValidH160 } from "@parity/product-sdk-address";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function shortenAddress(addr: string, head = 6, tail = 4) {
  if (!addr) return "";
  if (addr.length <= head + tail) return addr;
  return `${addr.slice(0, head)}…${addr.slice(-tail)}`;
}

/** Shortened SS58 rendering of an account. Contract-side H160s are shown as
 *  their revive-mapped SS58; comparisons elsewhere stay on the raw H160. */
export function displayAddress(addr: string, head = 6, tail = 4) {
  return shortenAddress(isValidH160(addr) ? h160ToSs58(addr) : addr, head, tail);
}

export function formatPlanck(amount: bigint, decimals = 10, symbol = "PAS"): string {
  const divisor   = 10n ** BigInt(decimals);
  const whole     = amount / divisor;
  const remainder = amount % divisor;
  if (remainder === 0n) return `${whole.toString()} ${symbol}`;
  const fraction = remainder.toString().padStart(decimals, "0").replace(/0+$/, "");
  return `${whole.toString()}.${fraction} ${symbol}`;
}

export function parsePlanck(input: string, decimals = 10): bigint {
  const [whole = "0", fraction = ""] = input.replace(/[^\d.]/g, "").split(".");
  const padded = fraction.padEnd(decimals, "0").slice(0, decimals);
  return BigInt(whole + padded);
}
