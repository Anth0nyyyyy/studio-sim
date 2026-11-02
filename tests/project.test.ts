import { describe, expect, it } from 'vitest';
import { on } from '../src/core/events';
import { newGame } from '../src/core/state';
import type { ProjectSpec } from '../src/core/types';
import { comboOf, evaluate, release, setSliders, startProject, validateSpec } from '../src/sim/project';
import { tick } from '../src/sim/tick';

const spec = (o: Partial<ProjectSpec> = {}): ProjectSpec => ({
  name: 'Test Quest', topic: 'Médiéval', genre: 'RPG', sub: null, audience: 'all', size: 'S', platforms: ['pc'], ...o,
});

let slidersAsked = 0;
on('sliders', () => slidersAsked++);

describe('projet de jeu', () => {
  it('valide la fiche', () => {
    const s = newGame();
    expect(validateSpec(s, spec({ name: ' ' }))).toMatch(/titre/);
    expect(validateSpec(s, spec({ size: 'M' }))).toMatch(/employés/);
    expect(validateSpec(s, spec({ platforms: ['orbit'] }))).toMatch(/indisponible/);
    expect(validateSpec(s, spec())).toBeNull();
  });

  it('lit la matrice des combos', () => {
    expect(comboOf('Médiéval', 'RPG')).toBe('*');
    expect(comboOf('Course', 'RPG')).toBe('x');
  });

  it('avance les phases grâce aux employés puis sort et vend', () => {
    const s = newGame();
    const money0 = s.money;
    const before = slidersAsked;
    expect(startProject(s, spec())).toBeNull();
    expect(s.money).toBeLessThan(money0);
    let guard = 0;
    while (s.project && s.project.phase < 3 && guard++ < 40000) {
      if (s.project.wait) setSliders(s, [40, 80, 100]);
      tick(s, 0.1);
    }
    expect(s.project?.phase).toBe(3);
    expect(slidersAsked - before).toBe(3);
    expect(s.project!.design + s.project!.tech).toBeGreaterThan(80);
    const g = release(s)!;
    expect(g.score).toBeGreaterThanOrEqual(1);
    expect(g.score).toBeLessThanOrEqual(10);
    expect(s.project).toBeNull();
    expect(s.combos['Médiéval|RPG']).toBe('*');
    const cash = s.money;
    for (let i = 0; i < 6 * 7 * 4 * 10; i++) tick(s, 0.1);
    expect(g.units).toBeGreaterThan(0);
    expect(s.fans).toBeGreaterThan(0);
    expect(s.money).not.toBe(cash);
  });

  it('un bon combo bien réglé bat un mauvais combo', () => {
    const s = newGame();
    startProject(s, spec());
    const p = s.project!;
    Object.assign(p, { design: 70, tech: 30, graph: 20, son: 10, bugs: 2, phase: 3, sliders: [[50, 80, 100], [60, 60, 90], [100, 70, 40]] });
    const good = evaluate(s, p).quality;
    p.topic = 'Course';
    const bad = evaluate(s, p).quality;
    expect(good).toBeGreaterThan(bad * 1.5);
  });
});
