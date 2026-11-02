import { describe, expect, it } from 'vitest';
import { emptyState, newGame } from '../src/core/state';
import { createRoom, layoutOk, placeFurniture, toggleDoor } from '../src/sim/build';
import { genCandidate, hire } from '../src/sim/employees';
import { invalidate, roomAt } from '../src/sim/grid';
import { findPath } from '../src/sim/pathfinding';
import { tick } from '../src/sim/tick';

function blank() {
  const s = emptyState(20, 16);
  s.money = 1e6;
  invalidate();
  return s;
}

describe('pathfinding', () => {
  it('trouve un chemin direct dans le couloir', () => {
    const s = blank();
    const p = findPath(s, 3, 3, [[8, 3]]);
    expect(p).not.toBeNull();
    expect(p!.length).toBe(5);
  });

  it('passe par la porte pour entrer dans une salle', () => {
    const s = blank();
    expect(createRoom(s, 'dev', 4, 4, 5, 4).ok).toBe(true);
    const p = findPath(s, s.entrance[0], s.entrance[1], [[6, 5]])!;
    expect(p).not.toBeNull();
    const enters = p.findIndex(([x, y]) => roomAt(s, x, y) > 0);
    const [dx, dy] = p[enters];
    // la case d'entrée est sur le bord de la salle
    expect(dx === 4 || dx === 8 || dy === 4 || dy === 7).toBe(true);
  });

  it('retourne null si la cible est inaccessible', () => {
    const s = blank();
    s.roomMap[5 * s.W + 5] = -1;
    invalidate();
    expect(findPath(s, 3, 3, [[5, 5]])).toBeNull();
  });
});

describe('construction', () => {
  it('refuse une salle trop petite ou qui chevauche', () => {
    const s = blank();
    expect(createRoom(s, 'dev', 4, 4, 2, 2).ok).toBe(false);
    expect(createRoom(s, 'dev', 4, 4, 4, 4).ok).toBe(true);
    expect(createRoom(s, 'wc', 6, 6, 3, 3).ok).toBe(false);
  });

  it('refuse un meuble qui enferme un poste', () => {
    const s = blank();
    createRoom(s, 'dev', 4, 4, 3, 3);
    expect(placeFurniture(s, 'desk', 5, 5).ok).toBe(true);
    const others: [number, number][] = [[4, 5], [6, 5], [5, 4], [5, 6]];
    const results = others.map(([x, y]) => placeFurniture(s, 'plant', x, y).ok);
    expect(results.filter(Boolean).length).toBeLessThan(4);
    expect(layoutOk(s)).toBe(true);
  });

  it('empêche de retirer la dernière porte', () => {
    const s = blank();
    createRoom(s, 'dev', 4, 4, 4, 4);
    const [xs, ys, d] = s.doors[0].split(',');
    const x = +xs, y = +ys;
    const r = toggleDoor(s, x, y, d === 'E' ? x + 1 : x, d === 'S' ? y + 1 : y);
    expect(r.ok).toBe(false);
  });
});

describe('employés', () => {
  it('un employé rejoint son poste et produit', () => {
    const s = blank();
    createRoom(s, 'dev', 4, 4, 4, 4);
    placeFurniture(s, 'desk', 5, 5);
    const c = genCandidate(s);
    s.candidates.push(c);
    hire(s, c.id, true);
    for (let i = 0; i < 200; i++) tick(s, 0.1);
    expect(s.employees[0].desk).not.toBeNull();
    expect(s.output.dev ?? 0).toBeGreaterThan(0);
  });

  it('la partie de départ est cohérente', () => {
    const s = newGame();
    expect(s.rooms.length).toBe(3);
    expect(s.employees.length).toBe(2);
    expect(layoutOk(s)).toBe(true);
    for (let i = 0; i < 2000; i++) tick(s, 0.1);
    expect(s.money).toBeLessThan(120000);
  });
});
