/**
 * Tambola ticket generator.
 *
 * Algorithm ported verbatim from `justraman/tambola/functions/src/helpers.ts`
 * (the `Ticket` / `TicketNode` classes), with two changes:
 *   1. Generate **one** ticket per call instead of batches of six.
 *   2. Replace `Math.random()` with `crypto.getRandomValues()` for entropy.
 *
 * Output: a 3-row × 9-col `number[][]` grid (zeros for empty cells). 15 numbers
 * total, 5 per row, column `c` only contains numbers in:
 *   c == 0       → [1, 9]
 *   1 ≤ c ≤ 7   → [c·10, c·10 + 9]
 *   c == 8       → [80, 90]
 *
 * Encoders for the on-chain `uint8[27]` layout live in ./encode.ts.
 */

function randInt(min: number, max: number): number {
  // inclusive [min, max]
  const range = max - min + 1;
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return min + (buf[0] % range);
}

function rangeArray(min: number, maxExclusive: number): number[] {
  const out: number[] = [];
  for (let i = min; i < maxExclusive; i++) out.push(i);
  return out;
}

function buildColumnPools(): number[][] {
  const pools: number[][] = [];
  pools.push(rangeArray(1, 10));                                 // col 0: 1..9
  for (let i = 1; i <= 7; i++) pools.push(rangeArray(i * 10, (i + 1) * 10));   // cols 1..7
  pools.push(rangeArray(80, 91));                                // col 8: 80..90
  return pools;
}

function countSetElements(set: number[][]): number {
  let n = 0;
  for (const col of set) n += col.length;
  return n;
}

class TicketNode {
  // grid[row][col]; 0 means empty
  grid: number[][];

  constructor() {
    this.grid = Array.from({ length: 3 }, () => Array(9).fill(0));
  }

  getColCount(c: number): number {
    let n = 0;
    for (let r = 0; r < 3; r++) if (this.grid[r][c] !== 0) n++;
    return n;
  }

  getEmptyCellInCol(c: number): number {
    for (let r = 0; r < 3; r++) if (this.grid[r][c] === 0) return r;
    return -1;
  }

  getRowCount(row: number): number {
    let n = 0;
    for (let c = 0; c < 9; c++) if (this.grid[row][c] !== 0) n++;
    return n;
  }

  private sortColumnThree(c: number) {
    const t = [this.grid[0][c], this.grid[1][c], this.grid[2][c]].sort((a, b) => a - b);
    for (let r = 0; r < 3; r++) this.grid[r][c] = t[r];
  }

  private sortColumnTwo(c: number) {
    const empty = this.getEmptyCellInCol(c);
    let a = 0, b = 1;
    if (empty === 0) { a = 1; b = 2; }
    else if (empty === 1) { a = 0; b = 2; }
    if (this.grid[a][c] > this.grid[b][c]) {
      const tmp = this.grid[a][c]; this.grid[a][c] = this.grid[b][c]; this.grid[b][c] = tmp;
    }
  }

  sortColumns() {
    for (let c = 0; c < 9; c++) {
      const n = this.getColCount(c);
      if (n === 2) this.sortColumnTwo(c);
      else if (n === 3) this.sortColumnThree(c);
    }
  }

  /**
   * Try to swap a few entries between `from` row and `to` row to make the
   * distribution less clustered. Ported from the reference repo's `doRandomSort`.
   */
  doRandomSort(from: number, to: number) {
    const snapshot: number[][] = this.grid.map((r) => r.slice());
    const indices = rangeArray(1, 9);
    let first = true, second = true, third = true, fourth = true;
    let count = 0;
    while ((first || second || third || fourth) && indices.length > 0 && count <= 9) {
      const idx = indices[randInt(0, indices.length - 1)];
      if ((first || third) && snapshot[from][idx] !== 0 && snapshot[to][idx] === 0) {
        const pos = indices.indexOf(idx);
        if (pos >= 0) indices.splice(pos, 1);
        if (first) first = false; else third = false;
        const tmp = snapshot[from][idx];
        snapshot[from][idx] = snapshot[to][idx];
        snapshot[to][idx] = tmp;
      }
      if ((second || fourth) && snapshot[from][idx] === 0 && snapshot[to][idx] !== 0) {
        const pos = indices.indexOf(idx);
        if (pos >= 0) indices.splice(pos, 1);
        if (second) second = false; else fourth = false;
        const tmp = snapshot[from][idx];
        snapshot[from][idx] = snapshot[to][idx];
        snapshot[to][idx] = tmp;
      }
      count++;
    }
    if (!first && !second && !third && !fourth) {
      this.grid = snapshot;
    }
  }
}

/**
 * Build a single valid Tambola ticket. Returns a fresh 3×9 grid.
 *
 * The reference algorithm generates six tickets at a time (a "strip") that
 * collectively use every number 1–90 exactly once. We retain the strip logic
 * because the per-column balancing depends on it — then return one of the six.
 */
export function generateTicket(): number[][] {
  const nodes: TicketNode[] = Array.from({ length: 6 }, () => new TicketNode());
  const columns = buildColumnPools();
  const sets: number[][][] = Array.from({ length: 6 }, () => Array.from({ length: 9 }, () => [] as number[]));

  // First pass: every set gets one number from every column.
  for (let i = 0; i < 9; i++) {
    for (let j = 0; j < 6; j++) {
      const idx = randInt(0, columns[i].length - 1);
      sets[j][i].push(columns[i][idx]);
      columns[i].splice(idx, 1);
    }
  }

  // Spill the 11th element of column 8 into a random set so its pool drains evenly.
  if (columns[8].length > 0) {
    const idx = randInt(0, columns[8].length - 1);
    sets[randInt(0, 5)][8].push(columns[8][idx]);
    columns[8].splice(idx, 1);
  }

  // Three more passes — each set can hold up to 2 per column at this stage.
  for (let pass = 0; pass < 3; pass++) {
    for (let i = 0; i < 9; i++) {
      if (columns[i].length === 0) continue;
      const idx = randInt(0, columns[i].length - 1);
      const value = columns[i][idx];
      let placed = false;
      while (!placed) {
        const sIdx = randInt(0, 5);
        if (countSetElements(sets[sIdx]) === 15) continue;
        if (sets[sIdx][i].length >= 2) continue;
        sets[sIdx][i].push(value);
        columns[i].splice(idx, 1);
        placed = true;
      }
    }
  }

  // Final pass — allow up to 3 per column.
  for (let i = 0; i < 9; i++) {
    while (columns[i].length > 0) {
      const idx = randInt(0, columns[i].length - 1);
      const value = columns[i][idx];
      let placed = false;
      while (!placed) {
        const sIdx = randInt(0, 5);
        if (countSetElements(sets[sIdx]) === 15) continue;
        if (sets[sIdx][i].length >= 3) continue;
        sets[sIdx][i].push(value);
        columns[i].splice(idx, 1);
        placed = true;
      }
    }
  }

  for (let s = 0; s < 6; s++) for (let c = 0; c < 9; c++) sets[s][c].sort((a, b) => a - b);

  for (let s = 0; s < 6; s++) {
    const node = nodes[s];
    const cur = sets[s];

    // Row 0: pick columns with size 3 first, then 2, then 1 (stop at 5 filled).
    for (let size = 3; size > 0; size--) {
      if (node.getRowCount(0) === 5) break;
      for (let col = 0; col < 9; col++) {
        if (node.getRowCount(0) === 5) break;
        if (node.grid[0][col] !== 0) continue;
        if (cur[col].length !== size) continue;
        node.grid[0][col] = cur[col].shift()!;
      }
    }
    // Row 1: 2-cell columns first.
    for (let size = 2; size > 0; size--) {
      if (node.getRowCount(1) === 5) break;
      for (let col = 0; col < 9; col++) {
        if (node.getRowCount(1) === 5) break;
        if (node.grid[1][col] !== 0) continue;
        if (cur[col].length !== size) continue;
        node.grid[1][col] = cur[col].shift()!;
      }
    }
    // Row 2: leftovers.
    for (let col = 0; col < 9; col++) {
      if (node.getRowCount(2) === 5) break;
      if (node.grid[2][col] !== 0) continue;
      if (cur[col].length === 0) continue;
      node.grid[2][col] = cur[col].shift()!;
    }
  }

  try {
    for (let s = 0; s < 6; s++) {
      nodes[s].doRandomSort(1, 2);
      nodes[s].doRandomSort(0, 1);
      nodes[s].doRandomSort(0, 2);
      nodes[s].sortColumns();
    }
  } catch {
    // matches reference behavior — sorting failures are non-fatal
  }

  // Pick one of the six tickets at random to return.
  const picked = nodes[randInt(0, 5)];
  return picked.grid;
}

/**
 * Quick client-side sanity check that a generated grid satisfies the on-chain
 * rules. Returns null if valid, otherwise a human-readable reason. The contract
 * runs an independent validator so this is purely for nicer UX.
 */
export function validateTicket(grid: number[][]): string | null {
  if (grid.length !== 3) return "expected 3 rows";
  const seen = new Set<number>();
  let total = 0;
  for (let row = 0; row < 3; row++) {
    if (grid[row].length !== 9) return `row ${row} has ${grid[row].length} cells`;
    let rowFilled = 0;
    for (let col = 0; col < 9; col++) {
      const v = grid[row][col];
      if (v === 0) continue;
      const min = col === 0 ? 1 : col * 10;
      const max = col === 8 ? 90 : col * 10 + 9;
      if (v < min || v > max) return `cell (${row},${col})=${v} out of [${min},${max}]`;
      if (seen.has(v)) return `duplicate number ${v}`;
      seen.add(v);
      rowFilled++;
      total++;
    }
    if (rowFilled !== 5) return `row ${row} has ${rowFilled} numbers, expected 5`;
  }
  if (total !== 15) return `${total} numbers total, expected 15`;
  for (let col = 0; col < 9; col++) {
    let prev = 0;
    let colCount = 0;
    for (let row = 0; row < 3; row++) {
      const v = grid[row][col];
      if (v === 0) continue;
      if (v <= prev) return `column ${col} not strictly increasing`;
      prev = v;
      colCount++;
    }
    if (colCount < 1 || colCount > 3) return `column ${col} has ${colCount} cells`;
  }
  return null;
}
