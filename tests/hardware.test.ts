import { describe, expect, it } from 'vitest';
import { RIVALS } from '../src/core/data';
import { newGame } from '../src/core/state';
import { DAY_SEC } from '../src/core/time';
import type { ConsoleSpec } from '../src/core/types';
import {
  allAvailablePlatforms, bestParts, consolePlatformId, consoleProduce, designConsole, expectedPerf,
  orderConsoles, referencePrice, retireConsole, royaltiesFor, validateConsole, weeklyDemand,
} from '../src/sim/hardware';
import { rivalRelease } from '../src/sim/market';
import { tick } from '../src/sim/tick';

const YEAR = 48 * 7 * DAY_SEC;

function ready() {
  const s = newGame();
  s.time = 6 * YEAR; // 1986
  s.done.hwlab = true;
  s.money = 1e7;
  const spec: ConsoleSpec = { name: 'Zéphyr', form: 'home', parts: bestParts(s), price: referencePrice(s, 'home') };
  return { s, spec };
}

describe('consoles', () => {
  it('demande la recherche et des composants de l’époque', () => {
    const { s, spec } = ready();
    s.done.hwlab = undefined as never;
    expect(validateConsole(s, spec)).toMatch(/Conception/);
    s.done.hwlab = true;
    expect(validateConsole(s, { ...spec, parts: { ...spec.parts, gpu: 4 } })).toMatch(/indisponible/);
    expect(validateConsole(s, spec)).toBeNull();
  });

  it('l’atelier hardware la développe puis elle sort avec un stock', () => {
    const { s, spec } = ready();
    expect(designConsole(s, spec)).toBeNull();
    expect(designConsole(s, spec)).toMatch(/déjà/);
    const c = s.consoles[0];
    expect(consoleProduce(s, 'dev', 1000)).toBe(false);
    expect(consoleProduce(s, 'hw', c.target)).toBe(true);
    expect(c.phase).toBe('live');
    expect(c.stock).toBeGreaterThan(0);
    expect(allAvailablePlatforms(s).some(p => p.id === consolePlatformId(c))).toBe(true);
  });

  it('se vend chaque semaine et augmente la base installée', () => {
    const { s, spec } = ready();
    designConsole(s, spec);
    const c = s.consoles[0];
    consoleProduce(s, 'hw', c.target);
    for (let i = 0; i < 4 * 7 * DAY_SEC * 10 + 5; i++) tick(s, 0.1);
    expect(c.installed).toBeGreaterThan(0);
    expect(c.revenue).toBeGreaterThan(0);
  });

  it('une console chère ou faible se vend moins', () => {
    const { s, spec } = ready();
    designConsole(s, spec);
    const c = s.consoles[0];
    consoleProduce(s, 'hw', c.target);
    const base = weeklyDemand(s, c);
    c.price *= 2;
    expect(weeklyDemand(s, c)).toBeLessThan(base);
    c.price /= 2;
    c.perf = expectedPerf(s, 'home') * 0.5;
    expect(weeklyDemand(s, c)).toBeLessThan(base);
  });

  it('les jeux concurrents sur votre console rapportent des royalties', () => {
    const { s, spec } = ready();
    designConsole(s, spec);
    const c = s.consoles[0];
    consoleProduce(s, 'hw', c.target);
    const m = s.money;
    royaltiesFor(s, consolePlatformId(c), 1000);
    expect(s.money).toBe(m + 2000);
    expect(c.royalties).toBe(2000);
    royaltiesFor(s, 'pc', 1000);
    expect(s.money).toBe(m + 2000);
    const g = rivalRelease(s, RIVALS[0]);
    expect(g.platform).toBeTruthy();
  });

  it('l’arrêt de production retire la plateforme après un an', () => {
    const { s, spec } = ready();
    designConsole(s, spec);
    const c = s.consoles[0];
    consoleProduce(s, 'hw', c.target);
    retireConsole(s, c);
    expect(c.phase).toBe('retired');
    expect(orderConsoles(s, c, 10)).toMatch(/pas en vente/);
    s.time += 2 * YEAR;
    expect(allAvailablePlatforms(s).some(p => p.id === consolePlatformId(c))).toBe(false);
  });
});
