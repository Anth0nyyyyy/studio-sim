import { describe, expect, it } from 'vitest';
import { on } from '../src/core/events';
import { RIVALS } from '../src/core/data';
import { newGame } from '../src/core/state';
import { DAY_SEC } from '../src/core/time';
import { activeRivals, bookStand, marketWeek, rivalRelease, runAwards, saturation, standCost, trendMult } from '../src/sim/market';
import { tick } from '../src/sim/tick';

const WEEK = 7 * DAY_SEC;

describe('marché', () => {
  it('les concurrents sortent des jeux et remplissent le classement', () => {
    const s = newGame();
    for (let i = 0; i < 30; i++) { s.time += WEEK; marketWeek(s); }
    expect(s.market.games.length).toBeGreaterThan(0);
    expect(s.market.chart.length).toBeGreaterThan(0);
    const w = s.market.chart.map(e => e.weekly);
    expect([...w].sort((a, b) => b - a)).toEqual(w);
  });

  it('seuls les studios en activité publient', () => {
    const s = newGame();
    const ids = activeRivals(s).map(r => r.id);
    expect(ids).toContain('forge');
    expect(ids).not.toContain('hexa');
    expect(ids.length).toBeLessThan(RIVALS.length);
  });

  it('tendance et saturation modulent les ventes', () => {
    const s = newGame();
    const { genre, topic } = s.market.trend;
    expect(trendMult(s, genre, topic)).toBeCloseTo(1.56);
    const before = saturation(s, 'Action');
    for (let i = 0; i < 5; i++) { const g = rivalRelease(s, RIVALS[0]); g.genre = 'Action'; }
    expect(saturation(s, 'Action')).toBeLessThan(before);
  });

  it('le salon donne de la hype au projet en cours', () => {
    const s = newGame();
    s.project = { hype: 0 } as unknown as typeof s.project;
    const m = s.money;
    expect(bookStand(s, 'small')).toBeNull();
    expect(s.money).toBe(m - standCost(s, 'small'));
    expect(s.project!.hype).toBe(20);
    s.money = 0;
    expect(bookStand(s, 'large')).toMatch(/Fonds/);
  });

  it('remet les prix et récompense le joueur', () => {
    const s = newGame();
    let got = 0;
    on('awards', p => { got = p.results.length; });
    s.games.push({ id: 999, name: 'Mon Hit', topic: 'Médiéval', genre: 'RPG', sub: null, audience: 'all', size: 'S', platforms: ['pc'], engine: 1,
      score: 10, reviews: [10, 10, 10, 10], quality: 1, units: 50000, revenue: 0, cost: 0, sched: [], si: 0, releasedAt: s.time, weekly: 0,
      price: 1, stock: 0, collector: 0, auto: false, lost: 0, digital: 0, bugs: 0, patched: false, kind: 'new', base: null, model: 'boxed' });
    s.market.yearUnits.player = 50000;
    const m = s.money;
    const res = runAwards(s, 1980);
    expect(got).toBe(res.length);
    expect(res.find(r => r.title === 'Jeu de l’année')?.player).toBe(true);
    expect(s.money).toBeGreaterThan(m);
  });

  it('le salon et les prix se déclenchent au fil du temps', () => {
    const s = newGame();
    let expo = 0, awards = 0;
    on('expo', () => expo++);
    on('awards', () => awards++);
    for (let i = 0; i < 12 * 4 * 7 * DAY_SEC * 10 + 50; i++) tick(s, 0.1);
    expect(expo).toBeGreaterThanOrEqual(1);
    expect(awards).toBeGreaterThanOrEqual(1);
  });
});
