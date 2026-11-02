import { describe, expect, it } from 'vitest';
import { DAY_SEC } from '../src/core/time';
import {
  advance, applyReport, buyShares, createWorld, effectiveSpeed, join, leave, playerValue, runAwards, sellShares, sharedPlatforms, weekStep,
} from '../server/world';

const WEEK = 7 * DAY_SEC;
const report = (o = {}) => ({ games: [], consoles: [], money: 100000, fans: 1000, ...o });

describe('monde partagé', () => {
  it('la vitesse la plus lente gagne et une pause bloque tout', () => {
    const w = createWorld();
    const a = join(w, 'ta', 'Alice', '#f00');
    const b = join(w, 'tb', 'Bob', '#0f0');
    w.players[a].vote = 4; w.players[b].vote = 2;
    expect(effectiveSpeed(w)).toBe(2);
    w.players[b].vote = 0;
    expect(effectiveSpeed(w)).toBe(0);
    const t = w.time;
    advance(w, 1);
    expect(w.time).toBe(t);
    leave(w, b);
    expect(effectiveSpeed(w)).toBe(4);
  });

  it('un joueur qui revient garde son identifiant', () => {
    const w = createWorld();
    const a = join(w, 'tok', 'Alice', '#f00');
    leave(w, a);
    expect(join(w, 'tok', 'Alice 2', '#00f')).toBe(a);
    expect(w.players[a].name).toBe('Alice 2');
  });

  it('les jeux des joueurs entrent dans le marché commun et le classement', () => {
    const w = createWorld();
    const a = join(w, 'ta', 'Alice', '#f00');
    applyReport(w, a, report({ games: [{ id: 7, name: 'Hit', topic: 'Médiéval', genre: 'RPG', score: 9, weekly: 1e6, units: 1e6, releasedAt: 0, platforms: ['pc'] }] }));
    w.time = WEEK; w.lastWeek = 1;
    weekStep(w);
    expect(w.market.chart[0].studio).toBe(`p:${a}`);
    expect(w.market.yearUnits[`p:${a}`]).toBe(1e6);
    const res = runAwards(w, 1980);
    expect(res.find(r => r.title === 'Jeu de l’année')?.studio).toBe(`p:${a}`);
  });

  it('les consoles des joueurs deviennent des plateformes et rapportent des royalties', () => {
    const w = createWorld();
    const a = join(w, 'ta', 'Alice', '#f00');
    const b = join(w, 'tb', 'Bob', '#0f0');
    applyReport(w, a, report({ consoles: [{ id: `p${a}:own3`, name: 'Zéphyr', market: 1, from: 1980, to: 2200 }] }));
    expect(sharedPlatforms(w).map(p => p.id)).toContain(`p${a}:own3`);
    applyReport(w, b, report({ games: [{ id: 1, name: 'Jeu de Bob', topic: 'Sport', genre: 'Action', score: 7, weekly: 1000, units: 1000, releasedAt: 0, platforms: [`p${a}:own3`] }] }));
    const out = weekStep(w);
    const roy = out.direct.find(([pid, m]) => pid === a && m.type === 'royalties');
    expect(roy).toBeTruthy();
  });

  it('bourse entre joueurs : achat, plafond de 100 %, revente, dividendes', () => {
    const w = createWorld();
    const a = join(w, 'ta', 'Alice', '#f00');
    const b = join(w, 'tb', 'Bob', '#0f0');
    applyReport(w, b, report());
    expect(playerValue(w, b)).toBeGreaterThan(0);
    for (let i = 0; i < 10; i++) buyShares(w, a, b);
    expect(w.players[b].holders[a]).toBe(100);
    const refused = buyShares(w, a, b).direct[0][1];
    expect(refused.type === 'shares' && refused.ok).toBe(false);
    const self = buyShares(w, a, a).direct[0][1];
    expect(self.type === 'shares' && self.ok).toBe(false);
    sellShares(w, a, b);
    expect(w.players[b].holders[a]).toBe(90);
    w.market.monthUnits[`p:${b}`] = 10000;
    w.time = 29 * DAY_SEC; w.lastWeek = 4;
    const out = weekStep(w);
    expect(out.direct.some(([pid, m]) => pid === a && m.type === 'dividend')).toBe(true);
  });

  it('les concurrents publient et le salon puis les trophées tombent au fil du temps', () => {
    const w = createWorld();
    const a = join(w, 'ta', 'Alice', '#f00');
    w.players[a].vote = 4;
    const kinds = new Set<string>();
    for (let i = 0; i < 48 * 7 * 6 * 1.3; i++) for (const m of advance(w, 0.25, 4).broadcast) kinds.add(m.type);
    expect(w.nextId - 1).toBeGreaterThan(5); // sorties concurrentes (les anciennes sont élaguées du marché)
    expect(kinds.has('expo')).toBe(true);
    expect(kinds.has('awards')).toBe(true);
  });
});
