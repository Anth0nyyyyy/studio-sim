import { describe, expect, it } from 'vitest';
import { on } from '../src/core/events';
import { newGame } from '../src/core/state';
import { DAY_SEC } from '../src/core/time';
import { checkAchievements } from '../src/sim/achievements';
import { careerScore, isOver, monthlyEndgame } from '../src/sim/endgame';
import { EVENTS, rollEvent, resolveEvent } from '../src/sim/random-events';
import { tick } from '../src/sim/tick';

const YEAR = 48 * 7 * DAY_SEC;

describe('événements aléatoires', () => {
  it('chaque événement propose au moins deux choix applicables', () => {
    const s = newGame();
    s.project = { name: 'P', hype: 0, progress: 10, target: 30, phase: 1, bugs: 0 } as unknown as typeof s.project;
    for (const ev of EVENTS) {
      const t = ev.pickTarget ? ev.pickTarget(s) ?? null : null;
      expect(ev.choices(s, t).length).toBeGreaterThanOrEqual(2);
      expect(typeof ev.text(s, t)).toBe('string');
    }
  });

  it('un tirage crée un événement en attente, résolu par un choix', () => {
    const s = newGame();
    let fired = 0;
    on('event', () => fired++);
    expect(rollEvent(s, 0)).toBe(true);
    expect(fired).toBe(1);
    expect(s.pendingEvent).not.toBeNull();
    expect(rollEvent(s, 0)).toBe(false);
    resolveEvent(s, 1);
    expect(s.pendingEvent).toBeNull();
    expect(rollEvent(s, 0.99)).toBe(false);
  });
});

describe('succès', () => {
  it('se débloquent une seule fois', () => {
    const s = newGame();
    s.money = 2e6;
    const got = checkAchievements(s);
    expect(got).toContain('million');
    expect(checkAchievements(s)).not.toContain('million');
  });
});

describe('fin de partie', () => {
  it('faillite après trois mois dans le rouge', () => {
    const s = newGame();
    let reason = '';
    on('gameover', p => { reason = p.reason; });
    s.money = -1;
    monthlyEndgame(s); monthlyEndgame(s);
    expect(isOver(s)).toBe(false);
    monthlyEndgame(s);
    expect(s.status).toBe('bankrupt');
    expect(reason).toBe('bankrupt');
    const t = s.time;
    tick(s, 1);
    expect(s.time).toBe(t);
  });

  it('la carrière se termine en 2013 et peut continuer en mode libre', () => {
    const s = newGame();
    s.time = 33 * YEAR;
    s.money = 1e6;
    monthlyEndgame(s);
    expect(s.status).toBe('ended');
    expect(careerScore(s).total).toBeGreaterThan(0);
    s.status = 'sandbox';
    monthlyEndgame(s);
    expect(s.status).toBe('sandbox');
  });
});
