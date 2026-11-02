import { describe, expect, it } from 'vitest';
import { newGame } from '../src/core/state';
import { DAY_SEC } from '../src/core/time';
import { buyResearch, createEngine, engineQualityMult, engineRatio, engineReady, maxPlatforms, monthlyLicenses, setLicensed } from '../src/sim/research';
import { evaluate, startProject } from '../src/sim/project';

describe('recherche', () => {
  it('débloque après paiement et respecte les prérequis', () => {
    const s = newGame();
    s.rp = 1000; s.money = 1e7;
    expect(buyResearch(s, 'sizeL')).toMatch(/Requiert/);
    expect(buyResearch(s, 'port')).toMatch(/Requiert/); // année 1984
    expect(buyResearch(s, 'sizeM')).toBeNull();
    expect(s.done.sizeM).toBe(true);
    expect(buyResearch(s, 'sizeM')).toMatch(/Déjà/);
    s.time = DAY_SEC * 28 * 12 * 5; // 1985
    expect(buyResearch(s, 'port')).toBeNull();
    expect(maxPlatforms(s)).toBe(2);
    expect(buyResearch(s, 'topics1')).toBeNull();
    expect(s.topics).toContain('Horreur');
  });

  it('refuse sans points de recherche', () => {
    const s = newGame();
    s.rp = 0;
    expect(buyResearch(s, 'sizeM')).toMatch(/recherche insuffisants/);
  });
});

describe('moteurs', () => {
  it('se construit en plusieurs jours puis devient utilisable', () => {
    const s = newGame();
    s.rp = 1000; s.money = 1e7;
    s.time = DAY_SEC * 28 * 12 * 6; // 1986
    buyResearch(s, 'graph1'); buyResearch(s, 'son1'); buyResearch(s, 'ctrl1');
    const f = { graph: 'graph1', son: 'son1', ctrl: 'ctrl1', ia: 'ia0', phys: 'phys0' };
    expect(createEngine(s, 'Turbo', f)).toBeNull();
    const e = s.engines[s.engines.length - 1];
    expect(engineReady(s, e)).toBe(false);
    expect(createEngine(s, 'Autre', f)).toMatch(/construction/);
    s.time = e.readyAt;
    expect(engineReady(s, e)).toBe(true);
    const old = s.engines[0];
    expect(engineRatio(s, e, 'Action')).toBeGreaterThan(engineRatio(s, old, 'Action'));
  });

  it('un moteur dépassé fait baisser la qualité', () => {
    const s = newGame();
    s.time = DAY_SEC * 28 * 12 * 20; // 2000
    startProject(s, { name: 'X', topic: 'Médiéval', genre: 'RPG', sub: null, audience: 'all', size: 'S', platforms: ['pc'], engine: s.engines[0].id });
    const b = evaluate(s, s.project!);
    expect(b.engine).toBeLessThan(0.5);
    expect(engineQualityMult(b.engine)).toBeLessThan(0.9);
  });

  it('les licences rapportent seulement après la recherche', () => {
    const s = newGame();
    const e = s.engines[0];
    expect(setLicensed(s, e.id, true)).toMatch(/Licences/);
    s.done.enginelic = true;
    expect(setLicensed(s, e.id, true)).toBeNull();
    const m = s.money;
    monthlyLicenses(s);
    expect(s.money).toBeGreaterThan(m);
  });
});
