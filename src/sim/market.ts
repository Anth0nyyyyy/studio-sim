import { AWARDS, EXPO, GENRES, RIVAL, RIVALS, RIVAL_NAME_A, RIVAL_NAME_B, TOPICS, TREND_WEEKS } from '../core/data';
import { emit } from '../core/events';
import { log } from '../core/log';
import { START_YEAR, monthIndex, weekIndex } from '../core/time';
import type { AwardResult, ChartEntry, GameState, Market, RivalDef, RivalGame } from '../core/types';
import { clamp, money, pick, rnd } from '../core/util';
import { book } from '../core/ledger';
import { availablePlatforms, comboOf, year } from './project';
import { royaltiesFor } from './hardware';
import { NET, myStudio } from '../core/net-state';

export const CHART_SIZE = 10;
const yearOf = (t: number) => START_YEAR + Math.floor(monthIndex(t) / 12);
const yearFactor = (s: GameState) => 1 + (year(s) - START_YEAR) * 0.08;

function pickTrend(s: GameState, week: number, avoid?: string) {
  const genres = GENRES.map(g => g.id).filter(g => g !== avoid);
  return { genre: pick(genres), topic: pick(TOPICS).name, until: week + TREND_WEEKS };
}

export function initMarket(s: GameState): Market {
  return { games: [], chart: [], trend: pickTrend(s, weekIndex(s.time)), awards: [], yearUnits: {}, monthUnits: {}, expoYear: year(s) - 1 };
}

export const activeRivals = (s: GameState) => RIVALS.filter(r => r.from <= year(s) && year(s) < r.to);

export function trendMult(s: GameState, genre: string, topic: string): number {
  return (s.market.trend.genre === genre ? 1.3 : 1) * (s.market.trend.topic === topic ? 1.2 : 1);
}

/** Concurrence : chaque sortie concurrente du même genre ces 4 dernières semaines rogne les ventes. */
export function saturation(s: GameState, genre: string): number {
  const w = weekIndex(s.time);
  const n = s.market.games.filter(g => g.genre === genre && weekIndex(g.releasedAt) >= w - 4).length;
  return 1 / (1 + 0.12 * n);
}

export function fanFactor(s: GameState, genre: string): number {
  return 1 + Math.sqrt(s.fans) / 200 + Math.sqrt(s.fansGenre[genre] ?? 0) / 120;
}

export function addFans(s: GameState, genre: string, n: number) {
  s.fans += n;
  s.fansGenre[genre] = (s.fansGenre[genre] ?? 0) + n;
}

function curve(n: number, total: number): number[] {
  const w = Array.from({ length: n }, (_, i) => (i < 2 ? 1 + i * 0.3 : 1.3 * Math.pow(0.82, i - 1)));
  const sum = w.reduce((a, b) => a + b, 0);
  return w.map(v => (v / sum) * total);
}

export function rivalRelease(s: GameState, r: RivalDef): RivalGame {
  const genre = Math.random() < 0.75 ? pick(r.genres) : pick(GENRES).id;
  const good = TOPICS.filter(t => '*+'.includes(comboOf(t.name, genre)));
  const topic = (Math.random() < 0.65 && good.length ? pick(good) : pick(TOPICS)).name;
  const plat = pick(availablePlatforms(s));
  const score = Math.round(clamp(3.2 + r.strength * 4 + rnd(-1.6, 1.6), 1, 10) * 10) / 10;
  const total = 18000 * plat.market * Math.pow(score / 10, 2.5) * (0.6 + r.strength * 0.6) * trendMult(s, genre, topic) * rnd(0.7, 1.3);
  const g: RivalGame = {
    id: s.nextId++, studio: r.id, name: `${pick(RIVAL_NAME_A)} ${pick(RIVAL_NAME_B)}`, topic, genre, platform: plat.id,
    score, units: 0, sched: curve(14, total), si: 0, releasedAt: s.time, weekly: 0,
  };
  s.market.games.push(g);
  if (score >= 9) log(s, `${r.name} frappe fort : ${g.name} (${score.toFixed(1)}/10).`);
  return g;
}

function updateChart(s: GameState) {
  const prev = new Map(s.market.chart.map((e, i) => [`${e.kind}${e.id}`, i + 1]));
  const entries: ChartEntry[] = [
    ...s.games.filter(g => g.weekly > 0).map(g => ({ kind: 'player' as const, id: g.id, name: g.name, studio: 'player', weekly: g.weekly, score: g.score, prev: null })),
    ...s.published.filter(g => g.weekly > 0).map(g => ({ kind: 'published' as const, id: g.id, name: g.name, studio: 'player', weekly: g.weekly, score: g.score, prev: null })),
    ...s.market.games.filter(g => g.weekly > 0).map(g => ({ kind: 'rival' as const, id: g.id, name: g.name, studio: g.studio, weekly: g.weekly, score: g.score, prev: null })),
  ].sort((a, b) => b.weekly - a.weekly).slice(0, CHART_SIZE);
  for (const e of entries) e.prev = prev.get(`${e.kind}${e.id}`) ?? null;
  s.market.chart = entries;
  const top = entries[0];
  if (top?.kind === 'player' && top.prev !== 1) log(s, `${top.name} est n°1 des ventes cette semaine !`);
  else for (const [i, e] of entries.entries()) if (e.kind === 'player' && e.prev === null) log(s, `${e.name} entre au classement à la ${i + 1}e place.`);
}

export function studioName(id: string) {
  if (id === 'player' || (NET.online && id === myStudio())) return 'Vous';
  return NET.names[id]?.name ?? RIVAL[id]?.name ?? id;
}

/** Remise des prix pour l'année écoulée. */
export function runAwards(s: GameState, y: number): AwardResult[] {
  const mine = s.games.filter(g => yearOf(g.releasedAt) === y).map(g => ({ name: g.name, studio: 'player', genre: g.genre, score: g.score, units: g.units }));
  const theirs = s.market.games.filter(g => yearOf(g.releasedAt) === y).map(g => ({ name: g.name, studio: g.studio, genre: g.genre, score: g.score, units: g.units }));
  const all = [...mine, ...theirs];
  const results: AwardResult[] = [];
  const best = (list: typeof all) => list.slice().sort((a, b) => b.score - a.score || b.units - a.units)[0];
  if (all.length) {
    const g = best(all);
    results.push({ year: y, title: 'Jeu de l’année', winner: g.name, studio: g.studio, player: g.studio === 'player' });
    for (const genre of GENRES.map(x => x.id)) {
      const list = all.filter(x => x.genre === genre);
      if (list.length < 2) continue;
      const w = best(list);
      results.push({ year: y, title: `Meilleur jeu ${genre}`, winner: w.name, studio: w.studio, player: w.studio === 'player' });
    }
  }
  const studios = Object.entries(s.market.yearUnits).sort((a, b) => b[1] - a[1]);
  if (studios.length && studios[0][1] > 0) {
    const [id] = studios[0];
    results.push({ year: y, title: 'Studio de l’année', winner: studioName(id), studio: id, player: id === 'player' });
  }
  const won = results.filter(r => r.player).length;
  if (won) {
    const prize = Math.round(AWARDS.prize * yearFactor(s)) * won;
    book(s, 'trophées', prize);
    const genre = s.games[0]?.genre ?? 'Action';
    addFans(s, genre, Math.round(s.fans * 0.05 + 500 * won));
    log(s, `${AWARDS.name} ${y} : ${won} trophée(s) pour vous, +${money(prize)}.`);
  }
  s.market.awards.unshift(...results);
  s.market.awards.length = Math.min(s.market.awards.length, 60);
  s.market.yearUnits = {};
  emit('awards', { year: y, results, won });
  return results;
}

export const standCost = (s: GameState, id: string) => Math.round((EXPO.stands.find(x => x.id === id)?.cost ?? 0) * yearFactor(s));

export function bookStand(s: GameState, id: string): string | null {
  const st = EXPO.stands.find(x => x.id === id);
  if (!st) return 'Stand inconnu';
  if (!st.cost) return null;
  const cost = standCost(s, id);
  if (s.money < cost) return 'Fonds insuffisants';
  book(s, 'marketing', -cost);
  const genre = s.project?.genre ?? s.games[0]?.genre ?? 'Action';
  if (s.project) s.project.hype += st.hype;
  addFans(s, genre, st.hype * 15);
  log(s, `${EXPO.name} : ${st.name.toLowerCase()} réservé${s.project ? `, +${st.hype} hype pour ${s.project.name}` : ''}.`);
  return null;
}

/** Une semaine de marché : tendances, sorties et ventes concurrentes, classement, salon, prix. */
export function marketWeek(s: GameState) {
  const m = s.market;
  const w = weekIndex(s.time);

  if (w >= m.trend.until) {
    m.trend = pickTrend(s, w, m.trend.genre);
    log(s, `Nouvelle tendance : le public réclame du ${m.trend.genre} et le thème ${m.trend.topic}.`);
  }

  for (const r of activeRivals(s)) if (Math.random() < r.rate / 48) rivalRelease(s, r);

  for (const g of m.games) {
    if (g.si < g.sched.length) {
      g.weekly = Math.round(g.sched[g.si++]);
      g.units += g.weekly;
      m.yearUnits[g.studio] = (m.yearUnits[g.studio] ?? 0) + g.weekly;
      m.monthUnits[g.studio] = (m.monthUnits[g.studio] ?? 0) + g.weekly;
      royaltiesFor(s, g.platform, g.weekly);
    } else g.weekly = 0;
  }
  const keepAfter = s.time - 6 * 28 * 14;
  m.games = m.games.filter(g => g.si < g.sched.length || g.releasedAt >= keepAfter).slice(-300);

  updateChart(s);

  if (monthIndex(s.time) % 12 === EXPO.month && m.expoYear < year(s)) {
    m.expoYear = year(s);
    emit('expo', { year: year(s) });
  }
  if (w > 0 && w % 48 === 0) runAwards(s, year(s) - 1);
}

/** Studios clients des licences de moteur (selon la fraîcheur du moteur). */
export function licenseClients(s: GameState, freshness: number): number {
  return Math.round(activeRivals(s).length * clamp((freshness - 0.6) / 0.6, 0, 1));
}

