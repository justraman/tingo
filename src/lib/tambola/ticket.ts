/**
 * Tambola ticket generator, ported from `justraman/tambola`
 * (`functions/src/helpers.ts`, `Ticket.generator`): build a strip of six 3×9
 * tickets that together use every number 1–90 exactly once, then return one.
 * Three deliberate changes from the reference:
 *   1. `Math.random()` → `crypto.getRandomValues()`.
 *   2. The reference's random set placement can corner itself and spin forever
 *      (every open set already saturated in the column); we detect the dead end
 *      and restart the strip instead.
 *   3. A row never carries 3+ adjacent numbers (max run of 2) — the reference
 *      produces clustered rows, which don't read like a real tambola ticket.
 *
 * Column `c` only holds numbers in: c==0 → [1,9], 1≤c≤7 → [c·10, c·10+9],
 * c==8 → [80,90]. Encoders for the on-chain `uint8[27]` layout live in ./encode.ts.
 */

const ROWS = 3;
const COLS = 9;
const SETS = 6;
const NUMBERS_PER_TICKET = 15;

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
  pools.push(rangeArray(1, 10));
  for (let i = 1; i <= 7; i++) pools.push(rangeArray(i * 10, (i + 1) * 10));
  pools.push(rangeArray(80, 91));
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
    this.grid = Array.from({ length: ROWS }, () => Array(COLS).fill(0));
  }

  getColCount(c: number): number {
    let n = 0;
    for (let r = 0; r < ROWS; r++) if (this.grid[r][c] !== 0) n++;
    return n;
  }

  getEmptyCellInCol(c: number): number {
    for (let r = 0; r < ROWS; r++) if (this.grid[r][c] === 0) return r;
    return -1;
  }

  getRowCount(row: number): number {
    let n = 0;
    for (let c = 0; c < COLS; c++) if (this.grid[row][c] !== 0) n++;
    return n;
  }

  private sortColumnThree(c: number) {
    const t = [this.grid[0][c], this.grid[1][c], this.grid[2][c]].sort((a, b) => a - b);
    for (let r = 0; r < ROWS; r++) this.grid[r][c] = t[r];
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
    for (let c = 0; c < COLS; c++) {
      const n = this.getColCount(c);
      if (n === 2) this.sortColumnTwo(c);
      else if (n === 3) this.sortColumnThree(c);
    }
  }

  /**
   * Swap a few entries between `from` and `to` rows to de-cluster the layout.
   * Committed only when two swaps landed in each direction, which keeps every
   * row at exactly 5 numbers. Ported from the reference's `doRandomSort`.
   */
  doRandomSort(from: number, to: number) {
    const snapshot: number[][] = this.grid.map((r) => r.slice());
    const indices = rangeArray(1, COLS);
    let first = true, second = true, third = true, fourth = true;
    let count = 0;
    while ((first || second || third || fourth) && indices.length > 0 && count <= 9) {
      const idx = indices[randInt(0, indices.length - 1)];
      if ((first || third) && snapshot[from][idx] !== 0 && snapshot[to][idx] === 0) {
        indices.splice(indices.indexOf(idx), 1);
        if (first) first = false; else third = false;
        snapshot[to][idx] = snapshot[from][idx];
        snapshot[from][idx] = 0;
      }
      if ((second || fourth) && snapshot[from][idx] === 0 && snapshot[to][idx] !== 0) {
        indices.splice(indices.indexOf(idx), 1);
        if (second) second = false; else fourth = false;
        snapshot[from][idx] = snapshot[to][idx];
        snapshot[to][idx] = 0;
      }
      count++;
    }
    if (!first && !second && !third && !fourth) {
      this.grid = snapshot;
    }
  }
}

/**
 * Draw a random number from column pool `col` and push it into a random set
 * that still has room (< 15 total, < `maxPerCol` in this column). Uniform over
 * eligible sets — the same distribution as the reference's rejection sampling,
 * without its unbounded loop. Returns false when no set qualifies.
 */
function placeRandomNumber(
  sets: number[][][],
  columns: number[][],
  col: number,
  maxPerCol: number,
): boolean {
  const idx = randInt(0, columns[col].length - 1);
  const eligible: number[] = [];
  for (let s = 0; s < SETS; s++) {
    if (countSetElements(sets[s]) === NUMBERS_PER_TICKET) continue;
    if (sets[s][col].length >= maxPerCol) continue;
    eligible.push(s);
  }
  if (eligible.length === 0) return false;
  sets[eligible[randInt(0, eligible.length - 1)]][col].push(columns[col][idx]);
  columns[col].splice(idx, 1);
  return true;
}

/** One attempt at a full strip of six tickets. Null when placement dead-ends. */
function tryGenerateStrip(): TicketNode[] | null {
  const columns = buildColumnPools();
  const sets: number[][][] = Array.from({ length: SETS }, () =>
    Array.from({ length: COLS }, () => [] as number[]),
  );

  // First pass: every set gets one number from every column.
  for (let i = 0; i < COLS; i++) {
    for (let j = 0; j < SETS; j++) {
      const idx = randInt(0, columns[i].length - 1);
      sets[j][i].push(columns[i][idx]);
      columns[i].splice(idx, 1);
    }
  }

  // Column 8 holds 11 numbers — hand its extra to a random set up front.
  {
    const idx = randInt(0, columns[8].length - 1);
    sets[randInt(0, SETS - 1)][8].push(columns[8][idx]);
    columns[8].splice(idx, 1);
  }

  // Three passes capped at 2 per column, then a final pass capped at 3.
  for (let pass = 0; pass < 3; pass++) {
    for (let i = 0; i < COLS; i++) {
      if (columns[i].length === 0) continue;
      if (!placeRandomNumber(sets, columns, i, 2)) return null;
    }
  }
  for (let i = 0; i < COLS; i++) {
    while (columns[i].length > 0) {
      if (!placeRandomNumber(sets, columns, i, 3)) return null;
    }
  }

  for (let s = 0; s < SETS; s++) for (let c = 0; c < COLS; c++) sets[s][c].sort((a, b) => a - b);

  const nodes: TicketNode[] = Array.from({ length: SETS }, () => new TicketNode());
  for (let s = 0; s < SETS; s++) {
    const node = nodes[s];
    const cur = sets[s];

    // Row 0: columns with 3 numbers first, then 2, then 1 (stop at 5 filled).
    for (let size = 3; size > 0; size--) {
      if (node.getRowCount(0) === 5) break;
      for (let col = 0; col < COLS; col++) {
        if (node.getRowCount(0) === 5) break;
        if (node.grid[0][col] !== 0) continue;
        if (cur[col].length !== size) continue;
        node.grid[0][col] = cur[col].shift()!;
      }
    }
    // Row 1: 2-cell columns first.
    for (let size = 2; size > 0; size--) {
      if (node.getRowCount(1) === 5) break;
      for (let col = 0; col < COLS; col++) {
        if (node.getRowCount(1) === 5) break;
        if (node.grid[1][col] !== 0) continue;
        if (cur[col].length !== size) continue;
        node.grid[1][col] = cur[col].shift()!;
      }
    }
    // Row 2: leftovers — at most one per column remains by this point.
    for (let col = 0; col < COLS; col++) {
      if (node.getRowCount(2) === 5) break;
      if (node.grid[2][col] !== 0) continue;
      if (cur[col].length === 0) continue;
      node.grid[2][col] = cur[col].shift()!;
    }
  }

  for (let s = 0; s < SETS; s++) {
    nodes[s].doRandomSort(1, 2);
    nodes[s].doRandomSort(0, 1);
    nodes[s].doRandomSort(0, 2);
    nodes[s].sortColumns();
  }
  return nodes;
}

function maxRowRun(grid: number[][]): number {
  let best = 0;
  for (const row of grid) {
    let run = 0;
    for (const v of row) {
      run = v !== 0 ? run + 1 : 0;
      if (run > best) best = run;
    }
  }
  return best;
}

/**
 * Build a single valid Tambola ticket: a de-clustered ticket (max run 2) from a
 * fresh strip. Roughly one strip in five contains one, so the expected cost
 * stays well under a millisecond.
 */
export function generateTicket(): number[][] {
  for (let attempt = 0; attempt < 512; attempt++) {
    const strip = tryGenerateStrip();
    if (!strip) continue;
    const eligible = strip.filter(
      (node) => maxRowRun(node.grid) <= 2 && validateTicket(node.grid) === null,
    );
    if (eligible.length === 0) continue;
    return eligible[randInt(0, eligible.length - 1)].grid;
  }
  throw new Error("ticket generation failed after 512 attempts");
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
