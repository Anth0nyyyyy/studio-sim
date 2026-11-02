import { describe, expect, it } from 'vitest';
import { newGame } from '../src/core/state';
import { DAY_SEC } from '../src/core/time';
import type { Game, GameState, ProjectSpec } from '../src/core/types';
import { createRoom, placeFurniture } from '../src/sim/build';
import { eligibleBases, kindError, liveOf, patchProduce, serverCapacity, startLive, startPatch, supportProduce } from '../src/sim/live';
import { projectCost, phaseTarget } from '../src/sim/project';
import { tick } from '../src/sim/tick';

const WEEK = 7 * DAY_SEC;
const YEAR = 48 * WEEK;

function game(s: GameState, o: Partial<Game> = {}): Game {
  const g: Game = {
    id: s.nextId++, name: 'Base', topic: 'Médiéval', genre: 'RPG', sub: null, audience: 'all', size: 'M', platforms: ['pc'], engine: 1, price: 1,
    score: 8, reviews: [8, 8, 8, 8], quality: 1, units: 40000, revenue: 0, cost: 0, sched: [5000, 5000, 5000], si: 0, releasedAt: s.time,
    weekly: 0, stock: 0, collector: 0, auto: false, lost: 0, digital: 0, bugs: 10, patched: false, kind: 'new', base: null, model: 'boxed', ...o,
  };
  s.games.unshift(g);
  return g;
}
const spec = (o: Partial<ProjectSpec>): ProjectSpec => ({
  name: 'X', topic: 'Médiéval', genre: 'RPG', sub: null, audience: 'all', size: 'S', platforms: ['pc'], engine: 1, price: 1, kind: 'new', base: null, model: 'boxed', ...o,
});

describe('suites, extensions, remasters', () => {
  it('une extension coûte moins cher et demande moins de travail', () => {
    const s = newGame();
    const full = spec({});
    const addon = spec({ kind: 'addon' });
    expect(projectCost(addon)).toBeLessThan(projectCost(full));
    expect(phaseTarget(s, addon)).toBeLessThan(phaseTarget(s, full));
  });

  it('les règles du jeu de base sont vérifiées', () => {
    const s = newGame();
    const b = game(s);
    expect(kindError(s, spec({ kind: 'addon', base: b.id }))).toMatch(/Extensions/);
    s.done.addons = true;
    expect(kindError(s, spec({ kind: 'addon', base: b.id }))).toBeNull();
    expect(kindError(s, spec({ kind: 'sequel', base: b.id, genre: 'Action' }))).toMatch(/genre/);
    expect(kindError(s, spec({ kind: 'remaster', base: b.id }))).toMatch(/8 ans/);
    s.time += 9 * YEAR;
    expect(eligibleBases(s, 'remaster')).toContain(b);
  });

  it('un MMO demande la recherche et une taille suffisante', () => {
    const s = newGame();
    expect(kindError(s, spec({ model: 'mmo', size: 'M' }))).toMatch(/en ligne/);
    s.done.online = true;
    expect(kindError(s, spec({ model: 'mmo', size: 'S' }))).toMatch(/Moyen/);
    expect(kindError(s, spec({ model: 'mmo', size: 'M' }))).toBeNull();
  });
});

describe('jeux en ligne', () => {
  it('les joueurs arrivent, paient et partent sans serveurs', () => {
    const s = newGame();
    const g = game(s, { model: 'mmo', sched: Array(8).fill(8000), stock: 100000 });
    startLive(s, g);
    for (let i = 0; i < 4 * WEEK * 10 + 5; i++) tick(s, 0.1);
    const l = liveOf(s, g.id)!;
    expect(l.peak).toBeGreaterThan(0);
    expect(l.revenue).toBeGreaterThan(0);
    expect(l.satisfaction).toBeLessThan(60); // aucun serveur : saturation
  });

  it('une baie de serveurs donne de la capacité', () => {
    const s = newGame();
    s.money = 1e7;
    expect(createRoom(s, 'server', s.lot.x0 + 1, s.lot.y0 + 1, 4, 3).ok).toBe(true);
    const r = s.rooms[s.rooms.length - 1];
    expect(placeFurniture(s, 'rack', r.x + 1, r.y).ok).toBe(true);
    expect(serverCapacity(s)).toBe(20000);
  });
});

describe('patchs et support', () => {
  it('un patch absorbe la production et relance les ventes', () => {
    const s = newGame();
    const g = game(s);
    expect(startPatch(s, g.id)).toBeNull();
    expect(startPatch(s, g.id)).toMatch(/déjà/);
    const before = g.sched[1];
    expect(patchProduce(s, 'dev', 1000)).toBe(true);
    expect(g.patched).toBe(true);
    expect(g.bugs).toBe(0);
    expect(g.sched[1]).toBeGreaterThan(before);
    expect(startPatch(s, g.id)).toMatch(/déjà/);
  });

  it('le support est comptabilisé chaque semaine', () => {
    const s = newGame();
    expect(supportProduce(s, 'support', 5)).toBe(true);
    expect(s.supportWeek).toBe(5);
    expect(supportProduce(s, 'dev', 5)).toBe(false);
  });
});
