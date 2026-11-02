import type { GameState } from '../core/types';

export const DIRS: ReadonlyArray<readonly [number, number]> = [[0, 1], [0, -1], [1, 0], [-1, 0]];

export const idx = (s: GameState, x: number, y: number) => y * s.W + x;
export const inBounds = (s: GameState, x: number, y: number) => x >= 0 && y >= 0 && x < s.W && y < s.H;
export const roomAt = (s: GameState, x: number, y: number) => (inBounds(s, x, y) ? s.roomMap[idx(s, x, y)] : -1);

/** Clé unique d'une arête entre deux tuiles voisines. */
export function edgeKey(x1: number, y1: number, x2: number, y2: number): string {
  if (x2 === x1 + 1) return `${x1},${y1},E`;
  if (x2 === x1 - 1) return `${x2},${y2},E`;
  if (y2 === y1 + 1) return `${x1},${y1},S`;
  return `${x2},${y2},S`;
}

let owner: GameState | null = null;
let furnCache: Int32Array | null = null;
let doorCache: Set<string> | null = null;

/** À appeler après toute modification des meubles, portes ou salles. */
export function invalidate() { furnCache = null; doorCache = null; }

function ensure(s: GameState) {
  if (owner !== s) { owner = s; furnCache = null; doorCache = null; }
}
export function furnGrid(s: GameState): Int32Array {
  ensure(s);
  if (!furnCache) {
    furnCache = new Int32Array(s.W * s.H);
    for (const f of s.furniture) furnCache[idx(s, f.x, f.y)] = f.id;
  }
  return furnCache;
}
export function doorSet(s: GameState): Set<string> {
  ensure(s);
  if (!doorCache) doorCache = new Set(s.doors);
  return doorCache;
}

export const furnAt = (s: GameState, x: number, y: number) => (inBounds(s, x, y) ? furnGrid(s)[idx(s, x, y)] : 0);
export const walkable = (s: GameState, x: number, y: number) => roomAt(s, x, y) >= 0 && furnAt(s, x, y) === 0;

export function canStep(s: GameState, x1: number, y1: number, x2: number, y2: number): boolean {
  if (!walkable(s, x2, y2)) return false;
  if (roomAt(s, x1, y1) === roomAt(s, x2, y2)) return true;
  return doorSet(s).has(edgeKey(x1, y1, x2, y2));
}

/** Tuiles atteignables depuis l'entrée. */
export function reachableFromEntrance(s: GameState): Uint8Array {
  const seen = new Uint8Array(s.W * s.H);
  const [ex, ey] = s.entrance;
  if (!walkable(s, ex, ey)) return seen;
  const q: number[] = [idx(s, ex, ey)];
  seen[q[0]] = 1;
  while (q.length) {
    const c = q.pop()!;
    const cx = c % s.W, cy = (c / s.W) | 0;
    for (const [dx, dy] of DIRS) {
      const nx = cx + dx, ny = cy + dy;
      if (!inBounds(s, nx, ny)) continue;
      const ni = idx(s, nx, ny);
      if (seen[ni] || !canStep(s, cx, cy, nx, ny)) continue;
      seen[ni] = 1;
      q.push(ni);
    }
  }
  return seen;
}

/** Tuiles libres adjacentes à un meuble, dans la même salle. */
export function seatsOf(s: GameState, fx: number, fy: number, room: number): [number, number][] {
  const out: [number, number][] = [];
  for (const [dx, dy] of DIRS) {
    const nx = fx + dx, ny = fy + dy;
    if (roomAt(s, nx, ny) === room && walkable(s, nx, ny)) out.push([nx, ny]);
  }
  return out;
}
