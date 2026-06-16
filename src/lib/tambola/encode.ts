/**
 * Convert between the in-memory 3×9 grid and the on-chain `uint8[27]` payload.
 *
 * The contract uses row-major indexing: `slot = row * 9 + col`. Numbers in
 * empty cells are encoded as zero.
 */

export type TicketLayout = number[]; // length 27, values 0..90

export function encodeLayout(grid: number[][]): TicketLayout {
  const out: number[] = new Array(27).fill(0);
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 9; col++) {
      out[row * 9 + col] = grid[row][col] ?? 0;
    }
  }
  return out;
}

export function decodeLayout(layout: TicketLayout): number[][] {
  const grid: number[][] = [[], [], []];
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 9; col++) {
      grid[row][col] = layout[row * 9 + col] ?? 0;
    }
  }
  return grid;
}

/**
 * Compute the four bitmaps (full house + each row) that the contract derives.
 * Bit `i` (0-indexed) corresponds to number `i + 1`.
 */
export function bitmasksFromLayout(layout: TicketLayout): {
  fullhouseMask: bigint;
  topRowMask: bigint;
  middleRowMask: bigint;
  bottomRowMask: bigint;
} {
  let full = 0n, top = 0n, mid = 0n, bot = 0n;
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 9; col++) {
      const v = layout[row * 9 + col];
      if (!v) continue;
      const bit = 1n << BigInt(v - 1);
      full |= bit;
      if (row === 0) top |= bit;
      else if (row === 1) mid |= bit;
      else bot |= bit;
    }
  }
  return { fullhouseMask: full, topRowMask: top, middleRowMask: mid, bottomRowMask: bot };
}

/** Whether `number` is marked in a 90-bit bitmap. */
export function maskHas(mask: bigint, n: number): boolean {
  return (mask & (1n << BigInt(n - 1))) !== 0n;
}
