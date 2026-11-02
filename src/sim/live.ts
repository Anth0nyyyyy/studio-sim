import { FURN } from '../core/data';
import { book } from '../core/ledger';
import { log } from '../core/log';
import { DAY_SEC } from '../core/time';
import type { BusinessModel, Game, GameState, ProjectKind, ProjectSpec } from '../core/types';
import { clamp, money } from '../core/util';
import { addFans } from './market';

const WEEK = 7 * DAY_SEC;
const YEAR = 48 * WEEK;

export const KIND_LABEL: Record<ProjectKind, string> = { new: 'Nouveau jeu', sequel: 'Suite', addon: 'Extension', remaster: 'Remaster' };
export const MODEL_LABEL: Record<BusinessModel, string> = { boxed: 'Vente classique', mmo: 'Abonnement (MMO)', f2p: 'Free-to-play' };
export const SUBSCRIPTION = 12;
export const F2P_ARPU = 1.5;
export const CLOSE_BELOW = 500;

/* =================== Types de projet =================== */

export function baseGame(s: GameState, spec: Pick<ProjectSpec, 'base'>): Game | undefined {
  return spec.base === null ? undefined : s.games.find(g => g.id === spec.base);
}

/** Jeux pouvant servir de base à ce type de projet. */
export function eligibleBases(s: GameState, kind: ProjectKind): Game[] {
  if (kind === 'new') return [];
  if (kind === 'sequel') return s.games.filter(g => g.kind !== 'addon');
  if (kind === 'addon') return s.games.filter(g => g.kind !== 'addon' && (g.si < g.sched.length || s.time - g.releasedAt < YEAR || liveOf(s, g.id)));
  return s.games.filter(g => g.kind === 'new' && s.time - g.releasedAt >= 8 * YEAR);
}

export function kindError(s: GameState, spec: ProjectSpec): string | null {
  if (spec.kind === 'addon' && !s.done.addons) return 'Recherchez « Extensions » pour en développer';
  if (spec.model === 'mmo' && !s.done.online) return 'Recherchez « Jeux en ligne » pour un MMO';
  if (spec.model === 'f2p' && !s.done.f2p) return 'Recherchez « Free-to-play »';
  if (spec.model === 'mmo' && spec.size === 'S') return 'Un MMO demande au moins la taille Moyen';
  if (spec.kind !== 'new' && spec.model !== 'boxed' && spec.kind !== 'sequel') return 'Ce type de projet est vendu de façon classique';
  if (spec.kind === 'new') return null;
  const b = baseGame(s, spec);
  if (!b) return 'Choisissez le jeu de base';
  if (!eligibleBases(s, spec.kind).includes(b)) {
    return spec.kind === 'remaster' ? 'Un remaster demande un jeu original de plus de 8 ans' : spec.kind === 'addon' ? 'Ce jeu n’est plus assez récent pour une extension' : 'Jeu de base invalide';
  }
  if (spec.topic !== b.topic || spec.genre !== b.genre) return 'Sujet et genre doivent rester ceux du jeu de base';
  return null;
}

export const KIND_COST: Record<ProjectKind, number> = { new: 1, sequel: 1, addon: 0.3, remaster: 0.6 };
export const KIND_WORK: Record<ProjectKind, number> = { new: 1, sequel: 1, addon: 0.35, remaster: 0.5 };
export const MODEL_WORK: Record<BusinessModel, number> = { boxed: 1, mmo: 1.5, f2p: 1.1 };

/** Bonus de qualité propre au type de projet. */
export function kindQuality(s: GameState, spec: ProjectSpec): number {
  const b = baseGame(s, spec);
  if (!b) return 1;
  if (spec.kind === 'sequel') {
    const tooSoon = s.time - b.releasedAt < YEAR ? 0.85 : 1;
    return (b.score >= 7 ? 1.05 : b.score < 5 ? 0.92 : 1) * tooSoon;
  }
  if (spec.kind === 'remaster') return b.score >= 8 ? 1.1 : 0.95;
  return 1;
}

/** Hype de départ héritée du jeu de base. */
export function inheritedHype(s: GameState, spec: ProjectSpec): number {
  const b = baseGame(s, spec);
  if (!b || spec.kind === 'addon') return 0;
  return b.score >= 7 ? Math.round(b.score * (spec.kind === 'sequel' ? 8 : 4)) : 0;
}

/** Ventes totales attendues pour une extension : une part des acheteurs du jeu de base. */
export function addonTotal(s: GameState, spec: ProjectSpec, score: number): number {
  const b = baseGame(s, spec);
  if (!b) return 0;
  const buyers = b.model === 'boxed' ? b.units : (liveOf(s, b.id)?.players ?? b.units * 0.3);
  return buyers * 0.3 * Math.pow(score / 10, 1.5);
}

/* =================== Jeux en ligne =================== */

export const liveOf = (s: GameState, gameId: number) => s.live.find(l => l.gameId === gameId && !l.closed);
export const serverCapacity = (s: GameState) => s.furniture.reduce((a, f) => a + (FURN[f.type].players ?? 0), 0);
export const serverUpkeep = (s: GameState) => s.furniture.reduce((a, f) => a + (FURN[f.type].upkeep ?? 0), 0);
export const livePlayers = (s: GameState) => s.live.filter(l => !l.closed).reduce((a, l) => a + l.players, 0);

export function startLive(s: GameState, g: Game) {
  s.live.push({ gameId: g.id, players: 0, peak: 0, satisfaction: 75, contentAge: 0, revenue: 0, closed: false });
  if (serverCapacity(s) === 0) log(s, `${g.name} n’a aucun serveur : construisez une salle serveurs et des baies.`);
}

/** Une extension sortie relance un jeu en ligne. */
export function refreshLive(s: GameState, baseId: number) {
  const l = liveOf(s, baseId);
  if (!l) return;
  l.contentAge = 0;
  l.satisfaction = Math.min(100, l.satisfaction + 10);
}

function liveWeek(s: GameState) {
  const cap = serverCapacity(s);
  const total = livePlayers(s);
  const overflow = total > cap ? (total - cap) / Math.max(1, total) : 0;
  for (const l of s.live) {
    if (l.closed) continue;
    const g = s.games.find(o => o.id === l.gameId);
    if (!g) { l.closed = true; continue; }
    l.players += g.weekly;
    l.contentAge++;
    const target = 80 - Math.min(30, g.bugs * 0.8) - overflow * 100 - (1 - s.supportRatio) * 40 + (g.patched ? 5 : 0);
    l.satisfaction = clamp(l.satisfaction + (target - l.satisfaction) * 0.15, 0, 100);
    const churn = 0.02 + Math.max(0, (l.contentAge - 24) / 400) + (100 - l.satisfaction) / 1500 + overflow * 0.3;
    l.players = Math.max(0, Math.round(l.players * (1 - churn)));
    l.peak = Math.max(l.peak, l.players);
    if (overflow > 0.2 && l.players > 0 && Math.random() < 0.25) log(s, `${g.name} : serveurs saturés, les joueurs s’en vont.`);
    if (g.si >= g.sched.length && l.players < CLOSE_BELOW) {
      l.closed = true;
      log(s, `${g.name} : serveurs fermés (pic à ${l.peak.toLocaleString('fr-FR')} joueurs, ${money(l.revenue)} générés).`);
    }
  }
}

function liveMonth(s: GameState) {
  for (const l of s.live) {
    if (l.closed) continue;
    const g = s.games.find(o => o.id === l.gameId)!;
    const rev = Math.round(g.model === 'mmo' ? l.players * SUBSCRIPTION : l.players * F2P_ARPU * (l.satisfaction / 80));
    l.revenue += rev;
    book(s, g.model === 'mmo' ? 'abonnements' : 'microtransactions', rev);
  }
  const upkeep = serverUpkeep(s);
  if (upkeep) book(s, 'serveurs', -upkeep);
}

/* =================== Patchs =================== */

export function canPatch(g: Game) { return !g.patched && g.bugs >= 1; }

export function startPatch(s: GameState, gameId: number): string | null {
  if (s.patch) return 'Un patch est déjà en cours';
  const g = s.games.find(o => o.id === gameId);
  if (!g) return 'Jeu introuvable';
  if (!canPatch(g)) return g.patched ? 'Ce jeu a déjà été patché' : 'Ce jeu n’a pas de bug connu';
  if (g.si >= g.sched.length && !liveOf(s, g.id)) return 'Ce jeu n’est plus exploité';
  s.patch = { gameId, amount: Math.ceil(g.bugs * 2), progress: 0 };
  log(s, `Patch en préparation pour ${g.name}.`);
  return null;
}

/** Oriente la production dev/QA vers le patch en cours. Retourne true si les points sont absorbés. */
export function patchProduce(s: GameState, out: string, pts: number): boolean {
  const p = s.patch;
  if (!p || (out !== 'dev' && out !== 'qa')) return false;
  p.progress += out === 'qa' ? pts * 1.5 : pts;
  if (p.progress >= p.amount) {
    const g = s.games.find(o => o.id === p.gameId);
    s.patch = null;
    if (!g) return true;
    g.patched = true;
    const boost = 1 + Math.min(0.25, g.bugs / 60);
    for (let i = g.si; i < g.sched.length; i++) g.sched[i] *= boost;
    g.bugs = 0;
    const l = liveOf(s, g.id);
    if (l) l.satisfaction = Math.min(100, l.satisfaction + 15);
    addFans(s, g.genre, 200);
    log(s, `Patch publié pour ${g.name} : les joueurs apprécient.`);
  }
  return true;
}

/* =================== Support client =================== */

export const supportNeed = (s: GameState) =>
  (livePlayers(s) + s.games.reduce((a, g) => a + g.weekly, 0)) / 1500;

function supportWeek(s: GameState) {
  const need = supportNeed(s);
  s.supportRatio = need < 1 ? 1 : Math.min(1, s.supportWeek / need);
  s.supportWeek = 0;
  if (s.supportRatio < 0.5 && need > 5) {
    s.fans *= 0.995;
    if (Math.random() < 0.15) log(s, 'Le support client est débordé : les fans se plaignent.');
  }
}

export function supportProduce(s: GameState, out: string, pts: number): boolean {
  if (out !== 'support') return false;
  s.supportWeek += pts;
  return true;
}

/* =================== Crochets de temps =================== */

export function liveWeekly(s: GameState) {
  supportWeek(s);
  liveWeek(s);
}
export function liveMonthly(s: GameState) {
  liveMonth(s);
}

