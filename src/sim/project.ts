import { AUDIENCES, GENRE, GENRES, PHASES, PLATFORM, PLATFORMS, REVIEWERS, ROOMS, SIZES, SUB_BAD, SUB_GOOD, TOPIC } from '../core/data';
import { emit } from '../core/events';
import { log } from '../core/log';
import { START_YEAR, monthIndex } from '../core/time';
import type { Employee, Game, GameState, Project, ProjectSpec } from '../core/types';
import { clamp, money, rnd } from '../core/util';

export const COMBO_MULT: Record<string, number> = { '*': 1.25, '+': 1.1, '0': 1, '-': 0.82, x: 0.62 };
export const COMBO_LABEL: Record<string, string> = { '*': 'Combo parfait', '+': 'Bon combo', '0': 'Neutre', '-': 'Mauvais combo', x: 'Combo absurde' };
const AUD_MULT: Record<string, number> = { '+': 1.08, '0': 1, '-': 0.8 };
export const MAX_PLATFORMS = 3;
const BUG_RATE = 0.12;

export const year = (s: GameState) => START_YEAR + Math.floor(monthIndex(s.time) / 12);
export const availablePlatforms = (s: GameState) => PLATFORMS.filter(p => p.from <= year(s) && year(s) < p.to);
const norm = (a: number[]) => { const t = a.reduce((x, y) => x + y, 0) || 1; return a.map(v => v / t); };

export function comboOf(topic: string, genre: string): string {
  return TOPIC[topic].combo[GENRES.findIndex(g => g.id === genre)] ?? '0';
}
export function audienceFit(topic: string, audience: string): string {
  return TOPIC[topic].aud[AUDIENCES.findIndex(a => a.id === audience)] ?? '0';
}
export function subFit(genre: string, sub: string | null): number {
  if (!sub || sub === genre) return 1;
  const has = (list: [string, string][]) => list.some(([a, b]) => (a === genre && b === sub) || (a === sub && b === genre));
  return has(SUB_GOOD) ? 1.06 : has(SUB_BAD) ? 0.9 : 1;
}
/** Poids idéaux des domaines d'une phase (genre + éventuel sous-genre). */
export function idealWeights(genre: string, sub: string | null, phase: number): number[] {
  const g = GENRE[genre].w[phase];
  if (!sub || sub === genre) return g;
  const s = GENRE[sub].w[phase];
  return g.map((v, i) => v * 0.7 + s[i] * 0.3);
}

export function projectCost(spec: Pick<ProjectSpec, 'size' | 'platforms'>): number {
  return SIZES[spec.size].cost + spec.platforms.reduce((a, id) => a + PLATFORM[id].license, 0);
}
export function phaseTarget(spec: Pick<ProjectSpec, 'size' | 'platforms'>): number {
  return SIZES[spec.size].target * (1 + 0.25 * (spec.platforms.length - 1));
}

export function validateSpec(s: GameState, spec: ProjectSpec): string | null {
  if (s.project) return 'Un jeu est déjà en développement';
  if (!spec.name.trim()) return 'Donnez un titre au jeu';
  if (!TOPIC[spec.topic]) return 'Choisissez un sujet';
  if (!GENRE[spec.genre]) return 'Choisissez un genre';
  if (!spec.platforms.length) return 'Choisissez au moins une plateforme';
  if (spec.platforms.length > MAX_PLATFORMS) return `${MAX_PLATFORMS} plateformes maximum`;
  const avail = new Set(availablePlatforms(s).map(p => p.id));
  if (spec.platforms.some(p => !avail.has(p))) return 'Plateforme indisponible';
  if (s.employees.length < SIZES[spec.size].minStaff) return `Il faut ${SIZES[spec.size].minStaff} employés pour cette taille`;
  if (s.money < projectCost(spec)) return 'Fonds insuffisants';
  return null;
}

export function startProject(s: GameState, spec: ProjectSpec): string | null {
  const err = validateSpec(s, spec);
  if (err) return err;
  const cost = projectCost(spec);
  s.money -= cost;
  s.project = {
    ...spec, name: spec.name.trim(), cost, phase: 0, progress: 0, target: phaseTarget(spec),
    sliders: [[50, 50, 50], [50, 50, 50], [50, 50, 50]], wait: true,
    areas: [[0, 0, 0], [0, 0, 0], [0, 0, 0]],
    design: 0, tech: 0, graph: 0, son: 0, bugs: 0, hype: 0, startedAt: s.time,
  };
  log(s, `Développement lancé : ${s.project.name} (${spec.topic} / ${spec.genre}).`);
  emit('sliders', undefined);
  return null;
}

export function setSliders(s: GameState, values: number[]) {
  const p = s.project;
  if (!p || p.phase > 2) return;
  p.sliders[p.phase] = values.every(v => v <= 0) ? [1, 1, 1] : values.map(v => clamp(v, 0, 100));
  p.wait = false;
}

function advancePhase(s: GameState, p: Project) {
  p.phase++;
  p.progress = 0;
  if (p.phase <= 2) { p.wait = true; emit('sliders', undefined); }
  else log(s, `${p.name} : contenu terminé, place au polissage.`);
}

/**
 * Production d'un employé à son poste pendant dt.
 * factor = multiplicateur de motivation / fatigue / mobilier (sans la compétence).
 * Retourne les points produits.
 */
export function produce(s: GameState, e: Employee, roomType: string, factor: number, dt: number): number {
  const def = ROOMS[roomType];
  const out = def.out!;
  const skill = def.skills!.reduce((a, k) => a + e.skills[k], 0) / def.skills!.length;
  let pts = factor * dt * skill / 100;
  s.output[out] = (s.output[out] ?? 0) + pts;
  if (out === 'rp') { s.rp += pts; return pts; }

  const p = s.project;
  if (!p || p.wait) return pts;
  switch (out) {
    case 'dev':
      if (p.phase <= 2) {
        const sh = norm(p.sliders[p.phase]);
        let total = 0;
        PHASES[p.phase].areas.forEach(([, type], i) => {
          const v = factor * dt * sh[i] * e.skills[type === 'D' ? 'design' : 'prog'] / 100;
          p.areas[p.phase][i] += v;
          if (type === 'D') p.design += v; else p.tech += v;
          total += v;
        });
        p.bugs += total * BUG_RATE;
        p.progress += total;
        pts = total;
        if (p.progress >= p.target) advancePhase(s, p);
      } else {
        p.bugs = Math.max(0, p.bugs - pts * 0.5);
      }
      break;
    case 'graph': p.graph += pts; break;
    case 'son': p.son += pts; break;
    case 'qa': p.bugs = Math.max(0, p.bugs - pts * 1.5); break;
    case 'hype': p.hype += pts; break;
  }
  return pts;
}

export interface Breakdown {
  content: number; focus: number; balance: number; assets: number;
  combo: string; audience: string; sub: number; repeat: number; bugPenalty: number; quality: number;
}

export function evaluate(s: GameState, p: Project): Breakdown {
  const g = GENRE[p.genre];
  const focus = [0, 1, 2].map(ph => {
    const sh = norm(p.sliders[ph]);
    const ideal = norm(idealWeights(p.genre, p.sub, ph).map(v => v * v));
    return Math.max(0, 1 - sh.reduce((a, v, i) => a + Math.abs(v - ideal[i]), 0) * 0.9);
  }).reduce((a, b) => a + b) / 3;
  const dev = p.design + p.tech || 1;
  const balance = Math.max(0, 1 - Math.abs(p.design / dev - g.design) * 2);
  const assetPts = p.graph * g.graph + p.son * g.son;
  const cover = assetPts / (dev * 0.25 * (g.graph + g.son));
  const assets = 0.85 + 0.25 * Math.min(1.2, cover) / 1.2;
  const combo = comboOf(p.topic, p.genre);
  const audience = audienceFit(p.topic, p.audience);
  const sub = subFit(p.genre, p.sub);
  const prev = s.games[0];
  const repeat = prev && prev.topic === p.topic && prev.genre === p.genre ? 0.8 : prev && prev.genre === p.genre ? 0.95 : 1;
  const bugPenalty = Math.max(0.4, 1 - (p.bugs / dev) * 2);
  const content = dev + assetPts;
  const quality = content * (0.55 + 0.6 * focus) * (0.8 + 0.35 * balance) * assets *
    COMBO_MULT[combo] * AUD_MULT[audience] * sub * repeat * bugPenalty;
  return { content, focus, balance, assets, combo, audience, sub, repeat, bugPenalty, quality };
}

export const industry = (s: GameState) => 90 * Math.pow(1.08, year(s) - START_YEAR);

export function salesSchedule(s: GameState, spec: ProjectSpec, score: number, hype: number): number[] {
  const y = year(s);
  const sz = SIZES[spec.size];
  const platforms = spec.platforms.reduce((a, id) => {
    const pl = PLATFORM[id];
    const life = pl.to - y <= 1 ? 0.55 : y - pl.from < 1 ? 0.8 : 1;
    const fit = pl.likes.includes(spec.genre) ? 1.15 : pl.dislikes.includes(spec.genre) ? 0.8 : 1;
    return a + pl.market * life * fit;
  }, 0);
  const aud = AUDIENCES.find(a => a.id === spec.audience)!.market;
  const hypeMult = 1 + Math.min(1.5, hype / 50);
  const total = 20000 * platforms * sz.units * aud * Math.pow(score / 10, 2.5) *
    (1 + Math.sqrt(s.fans) / 150) * hypeMult * rnd(0.85, 1.15);
  const n = sz.weeks;
  const w = norm(Array.from({ length: n }, (_, i) => (i < 2 ? 1 + i * 0.3 : 1.3 * Math.pow(0.82, i - 1))));
  return w.map(v => v * total);
}

export function release(s: GameState): Game | null {
  const p = s.project;
  if (!p || p.phase < 3) return null;
  const b = evaluate(s, p);
  const ref = Math.max(s.best, industry(s));
  const base = clamp((b.quality / ref) * 7.2 + rnd(-0.5, 0.5), 1, 10);
  if (b.quality > s.best) s.best += (b.quality - s.best) * 0.6;
  const reviews = REVIEWERS.map(() => clamp(Math.round(base + rnd(-1, 1)), 1, 10));
  const score = reviews.reduce((a, c) => a + c, 0) / reviews.length;
  const spec: ProjectSpec = { name: p.name, topic: p.topic, genre: p.genre, sub: p.sub, audience: p.audience, size: p.size, platforms: p.platforms };
  const game: Game = {
    ...spec, id: s.nextId++, score, reviews, quality: b.quality,
    units: 0, revenue: 0, cost: p.cost, sched: salesSchedule(s, spec, score, p.hype), si: 0, releasedAt: s.time,
  };
  s.games.unshift(game);
  s.project = null;
  s.combos[`${p.topic}|${p.genre}`] = b.combo;

  // un domaine du genre est révélé
  const known = (s.know[p.genre] ??= []);
  const unknown: [number, number][] = [];
  for (let ph = 0; ph < 3; ph++) for (let i = 0; i < 3; i++) if (!known.includes(`${ph}-${i}`)) unknown.push([ph, i]);
  let insight = '';
  if (unknown.length) {
    const [ph, i] = unknown[Math.floor(Math.random() * unknown.length)];
    known.push(`${ph}-${i}`);
    insight = `Pour un jeu ${p.genre}, « ${PHASES[ph].areas[i][0]} » est ${importanceLabel(GENRE[p.genre].w[ph][i])}.`;
  }

  const notes: string[] = [];
  if (b.combo === '*') notes.push(`${p.topic} et ${p.genre} : le mélange fait mouche.`);
  if (b.combo === '-' || b.combo === 'x') notes.push(`${p.topic} et ${p.genre} : la presse n’a pas compris le concept.`);
  if (b.audience === '-') notes.push(`Ce sujet ne convient pas vraiment à ce public.`);
  if (b.sub > 1) notes.push('Le mélange des genres est réussi.');
  if (b.sub < 1) notes.push('Le mélange des genres sonne faux.');
  if (b.bugPenalty < 0.85) notes.push('Les testeurs se plaignent de nombreux bugs.');
  if (b.repeat < 1) notes.push('Trop proche de votre jeu précédent.');
  if (b.assets < 0.95) notes.push('Graphismes et son manquent de finition : pensez aux studios graphique et son.');
  if (b.balance < 0.5) notes.push(p.design / (p.design + p.tech) > GENRE[p.genre].design ? 'Créatif, mais techniquement à la traîne pour ce genre.' : 'Solide techniquement, mais manque de créativité pour ce genre.');
  if (b.focus < 0.55) notes.push('Les priorités de développement semblaient mal choisies.');

  log(s, `${game.name} est sorti : ${score.toFixed(1)}/10.`);
  emit('released', { game, notes, insight });
  return game;
}

export function importanceLabel(w: number) {
  return w >= 0.8 ? 'crucial' : w <= 0.4 ? 'secondaire' : 'utile sans plus';
}

/** Ventes hebdomadaires de tous les jeux en rayon. */
export function weeklySales(s: GameState) {
  for (const g of s.games) {
    if (g.si >= g.sched.length) continue;
    const u = Math.round(g.sched[g.si++]);
    const r = u * SIZES[g.size].price;
    g.units += u; g.revenue += r;
    s.money += r;
    s.fans += u * 0.05 * (g.score / 10);
    if (g.si === g.sched.length) log(s, `${g.name} quitte les rayons : ${u ? g.units.toLocaleString('fr-FR') : 0} ventes, bénéfice ${money(g.revenue - g.cost)}.`);
  }
}
