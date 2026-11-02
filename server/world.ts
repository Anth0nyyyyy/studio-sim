/**
 * Monde partagé d'une partie multijoueur : horloge, marché commun, bourse entre joueurs, chat.
 * Logique pure (pas de réseau) pour pouvoir être testée.
 */
import { AWARDS, EXPO, GENRES, PLATFORMS, RIVAL, RIVALS, RIVAL_NAME_A, RIVAL_NAME_B, TOPICS, TREND_WEEKS } from '../src/core/data';
import { START_YEAR, monthIndex, weekIndex } from '../src/core/time';
import type { AwardResult, ChartEntry, Market, RivalDef, RivalGame } from '../src/core/types';
import {
  GAME_ID_SPAN, consoleOwner, playerStudio, type ChatLine, type PlayerInfo, type Report, type ServerMsg, type SharedPlatform,
} from '../src/net/protocol';
import { comboOf } from '../src/sim/project';

export interface PlayerRec extends PlayerInfo { token: string; report: Report | null }
export interface World {
  version: 1;
  time: number;
  nextPid: number;
  nextId: number;
  lastWeek: number;
  lastMonth: number;
  players: Record<number, PlayerRec>;
  market: Market;
  chat: ChatLine[];
}
export interface Outbox { broadcast: ServerMsg[]; direct: [number, ServerMsg][] }
const box = (): Outbox => ({ broadcast: [], direct: [] });

const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T>(a: T[]): T => a[Math.floor(Math.random() * a.length)];
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const yearOf = (t: number) => START_YEAR + Math.floor(monthIndex(t) / 12);
const yearFactor = (w: World) => 1 + (yearOf(w.time) - START_YEAR) * 0.08;
const playerName = (w: World, studio: string) => {
  const m = /^p:(\d+)$/.exec(studio);
  return m ? w.players[+m[1]]?.name ?? studio : RIVAL[studio]?.name ?? studio;
};

export const ROYALTY = 2;
export const SHARE_STEP = 10;

export function createWorld(): World {
  const w: World = {
    version: 1, time: 0, nextPid: 1, nextId: 1, lastWeek: 0, lastMonth: 0, players: {}, chat: [],
    market: { games: [], chart: [], trend: { genre: 'Action', topic: 'Médiéval', until: 0 }, awards: [], yearUnits: {}, monthUnits: {}, expoYear: START_YEAR - 1 },
  };
  w.market.trend = newTrend(w);
  return w;
}

function newTrend(w: World, avoid?: string) {
  return { genre: pick(GENRES.map(g => g.id).filter(g => g !== avoid)), topic: pick(TOPICS).name, until: weekIndex(w.time) + TREND_WEEKS };
}

/* =================== Joueurs =================== */

export function join(w: World, token: string, name: string, color: string): number {
  const existing = Object.values(w.players).find(p => p.token === token);
  const clean = name.trim().slice(0, 20) || 'Studio';
  if (existing) {
    existing.name = clean; existing.color = color; existing.online = true;
    return existing.pid;
  }
  const pid = w.nextPid++;
  w.players[pid] = { pid, token, name: clean, color, online: true, money: 0, fans: 0, games: 0, value: 0, vote: 1, holders: {}, report: null };
  return pid;
}

export function leave(w: World, pid: number) {
  const p = w.players[pid];
  if (p) p.online = false;
}

export function publicPlayers(w: World): PlayerInfo[] {
  return Object.values(w.players).map(({ token: _t, report: _r, ...info }) => ({ ...info, value: playerValue(w, info.pid) }));
}

/** La vitesse commune est la plus lente demandée : une seule pause met tout le monde en pause. */
export function effectiveSpeed(w: World): number {
  const votes = Object.values(w.players).filter(p => p.online).map(p => p.vote);
  return votes.length ? Math.min(...votes) : 0;
}
export const pausedBy = (w: World) => Object.values(w.players).filter(p => p.online && p.vote === 0).map(p => p.name);

/* =================== Rapports des joueurs =================== */

export function applyReport(w: World, pid: number, r: Report) {
  const p = w.players[pid];
  if (!p) return;
  p.report = r; p.money = r.money; p.fans = r.fans; p.games = r.games.length;
  const studio = playerStudio(pid);
  for (const g of r.games) {
    const id = pid * GAME_ID_SPAN + g.id;
    let wg = w.market.games.find(o => o.id === id);
    if (!wg) {
      wg = { id, studio, name: g.name, topic: g.topic, genre: g.genre, platform: g.platforms[0] ?? 'pc', score: g.score, units: 0, sched: [], si: 0, releasedAt: g.releasedAt, weekly: 0 };
      w.market.games.push(wg);
    }
    const delta = Math.max(0, g.units - wg.units);
    wg.units = g.units; wg.weekly = g.weekly; wg.score = g.score;
    (wg as RivalGame & { platforms?: string[] }).platforms = g.platforms;
    w.market.yearUnits[studio] = (w.market.yearUnits[studio] ?? 0) + delta;
    w.market.monthUnits[studio] = (w.market.monthUnits[studio] ?? 0) + delta;
  }
}

/** Plateformes partagées : consoles en vente des joueurs. */
export function sharedPlatforms(w: World): SharedPlatform[] {
  const y = yearOf(w.time);
  return Object.values(w.players).flatMap(p => (p.report?.consoles ?? [])
    .filter(c => c.to > y)
    .map(c => ({ id: c.id, name: c.name, from: c.from, to: c.to, market: c.market, license: 0, likes: [], dislikes: [], owner: p.pid })));
}

/* =================== Bourse entre joueurs =================== */

export function playerValue(w: World, pid: number): number {
  const p = w.players[pid];
  if (!p) return 0;
  const units = w.market.yearUnits[playerStudio(pid)] ?? 0;
  return Math.round(Math.max(150000, p.money * 0.5 + units * 6 + p.fans * 3) * yearFactor(w));
}
export const sharePrice = (w: World, pid: number) => Math.round(playerValue(w, pid) * SHARE_STEP / 100);
const heldTotal = (p: PlayerRec) => Object.values(p.holders).reduce((a, v) => a + v, 0);

export function buyShares(w: World, buyer: number, target: number): Outbox {
  const out = box();
  const t = w.players[target];
  const fail = (error: string) => { out.direct.push([buyer, { type: 'shares', ok: false, target, pct: t?.holders[buyer] ?? 0, amount: 0, error }]); return out; };
  if (!t) return fail('Studio introuvable');
  if (target === buyer) return fail('Vous ne pouvez pas acheter vos propres parts');
  if (heldTotal(t) >= 100) return fail('Toutes les parts de ce studio sont déjà détenues');
  const price = Math.round(sharePrice(w, target) * 1.05);
  t.holders[buyer] = (t.holders[buyer] ?? 0) + SHARE_STEP;
  out.direct.push([buyer, { type: 'shares', ok: true, target, pct: t.holders[buyer], amount: -price }]);
  const who = w.players[buyer]?.name ?? '?';
  if (t.holders[buyer] >= 100) out.broadcast.push(chat(w, `${who} a racheté entièrement le studio de ${t.name} !`));
  else out.broadcast.push(chat(w, `${who} détient désormais ${t.holders[buyer]} % du studio de ${t.name}.`));
  out.broadcast.push({ type: 'players', players: publicPlayers(w) });
  return out;
}

export function sellShares(w: World, seller: number, target: number): Outbox {
  const out = box();
  const t = w.players[target];
  if (!t || (t.holders[seller] ?? 0) < SHARE_STEP) {
    out.direct.push([seller, { type: 'shares', ok: false, target, pct: t?.holders[seller] ?? 0, amount: 0, error: 'Aucune part à vendre' }]);
    return out;
  }
  t.holders[seller] -= SHARE_STEP;
  if (!t.holders[seller]) delete t.holders[seller];
  out.direct.push([seller, { type: 'shares', ok: true, target, pct: t.holders[seller] ?? 0, amount: Math.round(sharePrice(w, target) * 0.95) }]);
  out.broadcast.push({ type: 'players', players: publicPlayers(w) });
  return out;
}

/* =================== Chat =================== */

export function chat(w: World, text: string, from?: PlayerRec): ServerMsg {
  const line: ChatLine = from
    ? { from: from.name, color: from.color, text: text.slice(0, 300), t: w.time }
    : { from: 'Système', color: '#ffb347', text, t: w.time, system: true };
  w.chat.push(line);
  if (w.chat.length > 100) w.chat.splice(0, w.chat.length - 100);
  return { type: 'chat', lines: [line] };
}

/* =================== Marché =================== */

function curve(n: number, total: number): number[] {
  const v = Array.from({ length: n }, (_, i) => (i < 2 ? 1 + i * 0.3 : 1.3 * Math.pow(0.82, i - 1)));
  const sum = v.reduce((a, b) => a + b, 0);
  return v.map(x => (x / sum) * total);
}

function rivalRelease(w: World, r: RivalDef) {
  const y = yearOf(w.time);
  const genre = Math.random() < 0.75 ? pick(r.genres) : pick(GENRES).id;
  const good = TOPICS.filter(t => '*+'.includes(comboOf(t.name, genre)));
  const topic = (Math.random() < 0.65 && good.length ? pick(good) : pick(TOPICS)).name;
  const plats = [
    ...PLATFORMS.filter(p => p.from <= y && y < p.to).map(p => ({ id: p.id, market: p.market })),
    ...sharedPlatforms(w).filter(p => p.market >= 0.3).map(p => ({ id: p.id, market: p.market })),
  ];
  const plat = pick(plats);
  const score = Math.round(clamp(3.2 + r.strength * 4 + rnd(-1.6, 1.6), 1, 10) * 10) / 10;
  const trend = (w.market.trend.genre === genre ? 1.3 : 1) * (w.market.trend.topic === topic ? 1.2 : 1);
  const total = 18000 * plat.market * Math.pow(score / 10, 2.5) * (0.6 + r.strength * 0.6) * trend * rnd(0.7, 1.3);
  w.market.games.push({
    id: w.nextId++, studio: r.id, name: `${pick(RIVAL_NAME_A)} ${pick(RIVAL_NAME_B)}`, topic, genre, platform: plat.id,
    score, units: 0, sched: curve(14, total), si: 0, releasedAt: w.time, weekly: 0,
  });
}

function updateChart(w: World) {
  const prev = new Map(w.market.chart.map((e, i) => [e.id, i + 1]));
  w.market.chart = w.market.games.filter(g => g.weekly > 0).sort((a, b) => b.weekly - a.weekly).slice(0, 10)
    .map<ChartEntry>(g => ({ kind: 'rival', id: g.id, name: g.name, studio: g.studio, weekly: g.weekly, score: g.score, prev: prev.get(g.id) ?? null }));
}

/** Royalties dues aux propriétaires de consoles pour les jeux des autres sortis dessus cette semaine. */
function royalties(w: World, out: Outbox) {
  const due: Record<number, Record<string, number>> = {};
  for (const g of w.market.games) {
    if (g.weekly <= 0) continue;
    const plats = (g as RivalGame & { platforms?: string[] }).platforms ?? [g.platform];
    for (const id of plats) {
      const owner = consoleOwner(id);
      if (owner === null || g.studio === playerStudio(owner)) continue;
      (due[owner] ??= {})[id] = (due[owner][id] ?? 0) + (g.weekly / plats.length) * ROYALTY;
    }
  }
  for (const [owner, byConsole] of Object.entries(due))
    for (const [id, amount] of Object.entries(byConsole))
      out.direct.push([+owner, { type: 'royalties', amount: Math.round(amount), console: id }]);
}

export function runAwards(w: World, year: number): AwardResult[] {
  const games = w.market.games.filter(g => yearOf(g.releasedAt) === year);
  const best = (list: RivalGame[]) => list.slice().sort((a, b) => b.score - a.score || b.units - a.units)[0];
  const results: AwardResult[] = [];
  const add = (title: string, g: RivalGame) => results.push({ year, title, winner: g.name, studio: g.studio, player: false });
  if (games.length) {
    add('Jeu de l’année', best(games));
    for (const genre of GENRES.map(x => x.id)) {
      const list = games.filter(g => g.genre === genre);
      if (list.length >= 2) add(`Meilleur jeu ${genre}`, best(list));
    }
  }
  const top = Object.entries(w.market.yearUnits).sort((a, b) => b[1] - a[1])[0];
  if (top && top[1] > 0) results.push({ year, title: 'Studio de l’année', winner: playerName(w, top[0]), studio: top[0], player: false });
  w.market.awards.unshift(...results);
  w.market.awards.length = Math.min(w.market.awards.length, 60);
  w.market.yearUnits = {};
  return results;
}

function monthStep(w: World, out: Outbox) {
  for (const t of Object.values(w.players)) {
    const profit = (w.market.monthUnits[playerStudio(t.pid)] ?? 0) * 8 * 0.25;
    if (profit <= 0) continue;
    for (const [holder, pct] of Object.entries(t.holders)) {
      const amount = Math.round((profit * pct) / 100);
      if (amount > 0) out.direct.push([+holder, { type: 'dividend', amount, from: t.name }]);
    }
  }
  w.market.monthUnits = {};
}

export function weekStep(w: World): Outbox {
  const out = box();
  const m = w.market;
  const week = weekIndex(w.time);
  const y = yearOf(w.time);

  if (week >= m.trend.until) {
    m.trend = newTrend(w, m.trend.genre);
    out.broadcast.push(chat(w, `Nouvelle tendance : ${m.trend.genre} et le thème ${m.trend.topic}.`));
  }
  for (const r of RIVALS.filter(r => r.from <= y && y < r.to)) if (Math.random() < r.rate / 48) rivalRelease(w, r);
  for (const g of m.games) {
    if (g.studio.startsWith('p:')) continue;
    if (g.si < g.sched.length) {
      g.weekly = Math.round(g.sched[g.si++]);
      g.units += g.weekly;
      m.yearUnits[g.studio] = (m.yearUnits[g.studio] ?? 0) + g.weekly;
      m.monthUnits[g.studio] = (m.monthUnits[g.studio] ?? 0) + g.weekly;
    } else g.weekly = 0;
  }
  royalties(w, out);
  const keepAfter = w.time - 6 * 28 * 14;
  m.games = m.games.filter(g => g.studio.startsWith('p:') || g.si < g.sched.length || g.releasedAt >= keepAfter).slice(-400);
  updateChart(w);

  const month = monthIndex(w.time);
  if (month > w.lastMonth) { w.lastMonth = month; monthStep(w, out); }
  if (month % 12 === EXPO.month && m.expoYear < y) { m.expoYear = y; out.broadcast.push({ type: 'expo', year: y }); }
  if (week > 0 && week % 48 === 0) {
    const results = runAwards(w, y - 1);
    out.broadcast.push({ type: 'awards', year: y - 1, results });
    const winners = results.filter(r => r.studio.startsWith('p:')).map(r => `${playerName(w, r.studio)} (${r.title})`);
    out.broadcast.push(chat(w, `${AWARDS.name} ${y - 1} : ${winners.length ? winners.join(', ') : 'aucun joueur récompensé'}.`));
  }
  out.broadcast.push({ type: 'market', market: m, platforms: sharedPlatforms(w) });
  out.broadcast.push({ type: 'players', players: publicPlayers(w) });
  return out;
}

/** Fait avancer l'horloge de dtReal secondes réelles ; renvoie les messages des semaines écoulées. */
export function advance(w: World, dtReal: number, maxWeeks = 4): Outbox {
  const out = box();
  const speed = effectiveSpeed(w);
  if (!speed) return out;
  w.time += dtReal * speed;
  let n = 0;
  while (weekIndex(w.time) > w.lastWeek && n++ < maxWeeks) {
    w.lastWeek++;
    const o = weekStep(w);
    out.broadcast.push(...o.broadcast);
    out.direct.push(...o.direct);
  }
  return out;
}
