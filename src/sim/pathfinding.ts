import type { GameState } from '../core/types';
import { DIRS, canStep, idx, inBounds } from './grid';

class MinHeap {
  private k: number[] = [];
  private p: number[] = [];
  get size() { return this.k.length; }
  push(key: number, prio: number) {
    const k = this.k, p = this.p;
    k.push(key); p.push(prio);
    let i = k.length - 1;
    while (i > 0) {
      const j = (i - 1) >> 1;
      if (p[j] <= p[i]) break;
      [k[i], k[j]] = [k[j], k[i]]; [p[i], p[j]] = [p[j], p[i]];
      i = j;
    }
  }
  pop(): number {
    const k = this.k, p = this.p;
    const top = k[0];
    const lk = k.pop()!, lp = p.pop()!;
    if (k.length) {
      k[0] = lk; p[0] = lp;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < k.length && p[l] < p[m]) m = l;
        if (r < k.length && p[r] < p[m]) m = r;
        if (m === i) break;
        [k[i], k[m]] = [k[m], k[i]]; [p[i], p[m]] = [p[m], p[i]];
        i = m;
      }
    }
    return top;
  }
}

/**
 * A* 4 directions vers l'une des tuiles cibles.
 * Retourne la liste des tuiles à parcourir (sans la tuile de départ), [] si déjà arrivé, null si inaccessible.
 */
export function findPath(s: GameState, sx: number, sy: number, goals: [number, number][]): [number, number][] | null {
  if (!goals.length || !inBounds(s, sx, sy)) return null;
  const goalSet = new Set(goals.map(([x, y]) => idx(s, x, y)));
  const start = idx(s, sx, sy);
  if (goalSet.has(start)) return [];

  const h = (x: number, y: number) => {
    let m = Infinity;
    for (const [gx, gy] of goals) { const d = Math.abs(x - gx) + Math.abs(y - gy); if (d < m) m = d; }
    return m;
  };
  const N = s.W * s.H;
  const g = new Float64Array(N).fill(Infinity);
  const came = new Int32Array(N).fill(-1);
  const closed = new Uint8Array(N);
  const open = new MinHeap();
  g[start] = 0;
  open.push(start, h(sx, sy));

  while (open.size) {
    const cur = open.pop();
    if (closed[cur]) continue;
    closed[cur] = 1;
    if (goalSet.has(cur)) {
      const path: [number, number][] = [];
      for (let c = cur; c !== start; c = came[c]) path.push([c % s.W, (c / s.W) | 0]);
      return path.reverse();
    }
    const cx = cur % s.W, cy = (cur / s.W) | 0;
    for (const [dx, dy] of DIRS) {
      const nx = cx + dx, ny = cy + dy;
      if (!inBounds(s, nx, ny) || !canStep(s, cx, cy, nx, ny)) continue;
      const ni = idx(s, nx, ny);
      const ng = g[cur] + 1;
      if (ng < g[ni]) { g[ni] = ng; came[ni] = cur; open.push(ni, ng + h(nx, ny)); }
    }
  }
  return null;
}
