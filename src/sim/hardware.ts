import { HARDWARE, PLATFORM, PLATFORMS } from '../core/data';
import { book } from '../core/ledger';
import { log } from '../core/log';
import { DAY_SEC, START_YEAR, monthIndex } from '../core/time';
import { PART_IDS, type Console, type ConsoleSpec, type GameState, type PartId, type PlatformDef } from '../core/types';
import { clamp, money } from '../core/util';

const WEEK = 7 * DAY_SEC;
const YEAR = 48 * WEEK;
const yearOfTime = (t: number) => START_YEAR + Math.floor(monthIndex(t) / 12);
const yearNow = (s: GameState) => yearOfTime(s.time);
const yearFactor = (s: GameState) => 1 + (yearNow(s) - START_YEAR) * 0.08;

export const OWN_PREFIX = 'own';
export const consolePlatformId = (c: Console) => `${OWN_PREFIX}${c.id}`;
export const isOwnPlatform = (id: string) => id.startsWith(OWN_PREFIX);

/* =================== Conception =================== */

/** Index des composants disponibles à l'année courante, par catégorie. */
export function availableTiers(s: GameState, part: PartId): number[] {
  return HARDWARE.parts[part].tiers.map((t, i) => [t, i] as const).filter(([t]) => t[1] <= yearNow(s)).map(([, i]) => i);
}
export function bestParts(s: GameState): Record<PartId, number> {
  return Object.fromEntries(PART_IDS.map(p => [p, Math.max(...availableTiers(s, p))])) as Record<PartId, number>;
}

export function consolePerf(spec: Pick<ConsoleSpec, 'parts' | 'form'>): number {
  return PART_IDS.reduce((a, p) => a + HARDWARE.parts[p].tiers[spec.parts[p]][2], 0) * HARDWARE.forms[spec.form].perf;
}
export function consoleUnitCost(s: GameState, spec: Pick<ConsoleSpec, 'parts' | 'form'>): number {
  const raw = PART_IDS.reduce((a, p) => a + HARDWARE.parts[p].tiers[spec.parts[p]][3], 0) * HARDWARE.forms[spec.form].cost;
  return Math.round(raw * (s.done.hwfactory ? 0.85 : 1));
}
/** Performance attendue par le marché cette année (meilleurs composants × 0,85). */
export const expectedPerf = (s: GameState, form: ConsoleSpec['form']) => consolePerf({ parts: bestParts(s), form }) * 0.85;
/** Prix de vente habituel d'une console à cette époque. */
export const referencePrice = (s: GameState, form: ConsoleSpec['form']) =>
  Math.round((200 + (yearNow(s) - START_YEAR) * 8) * HARDWARE.forms[form].price);
export const consoleDevCost = (s: GameState, spec: Pick<ConsoleSpec, 'parts' | 'form'>) =>
  Math.round((100000 * yearFactor(s) + consolePerf(spec) * 5000) / 1000) * 1000;
export const consoleTarget = (spec: Pick<ConsoleSpec, 'parts' | 'form'>) => Math.round(60 + consolePerf(spec) * 8);

export function validateConsole(s: GameState, spec: ConsoleSpec): string | null {
  if (!s.done.hwlab) return 'Recherchez « Conception matérielle »';
  if (s.consoles.some(c => c.phase === 'dev')) return 'Une console est déjà en développement';
  if (!spec.name.trim()) return 'Donnez un nom à la console';
  for (const p of PART_IDS) if (!availableTiers(s, p).includes(spec.parts[p])) return `${HARDWARE.parts[p].label} indisponible cette année`;
  if (!(spec.price > 0)) return 'Prix invalide';
  if (s.money < consoleDevCost(s, spec)) return 'Fonds insuffisants';
  return null;
}

export function designConsole(s: GameState, spec: ConsoleSpec): string | null {
  const err = validateConsole(s, spec);
  if (err) return err;
  const devCost = consoleDevCost(s, spec);
  book(s, 'développement', -devCost);
  const c: Console = {
    ...spec, name: spec.name.trim(), parts: { ...spec.parts }, id: s.nextId++,
    perf: consolePerf(spec), unitCost: consoleUnitCost(s, spec), devCost,
    phase: 'dev', progress: 0, target: consoleTarget(spec), launchedAt: 0, retiredAt: 0,
    stock: 0, auto: true, installed: 0, weekly: 0, revenue: 0, royalties: 0,
  };
  s.consoles.push(c);
  log(s, `Conception de la console ${c.name} lancée : l’atelier hardware s’y consacre.`);
  return null;
}

/** La production de l'atelier hardware fait avancer la console en développement. */
export function consoleProduce(s: GameState, out: string, pts: number): boolean {
  if (out !== 'hw') return false;
  const c = s.consoles.find(o => o.phase === 'dev');
  if (!c) return false;
  c.progress += pts;
  if (c.progress >= c.target) launch(s, c);
  return true;
}

function launch(s: GameState, c: Console) {
  c.phase = 'live';
  c.launchedAt = s.time;
  const first = Math.round(HARDWARE.weeklyDemand * 3);
  orderConsoles(s, c, first);
  log(s, `${c.name} est en vente : ${money(c.price)} en magasin, ${money(c.unitCost)} à fabriquer.`);
}

/* =================== Fabrication et ventes =================== */

export function orderConsoles(s: GameState, c: Console, qty: number): string | null {
  if (c.phase !== 'live') return 'La console n’est pas en vente';
  const n = Math.round(qty);
  const cost = n * c.unitCost;
  if (n <= 0) return null;
  if (s.money < cost) return 'Fonds insuffisants';
  book(s, 'production', -cost);
  c.stock += n;
  return null;
}

/** Jeux sortis sur la console ces deux dernières années (bibliothèque). */
export function library(s: GameState, c: Console): number {
  const id = consolePlatformId(c), since = s.time - 2 * YEAR;
  const mine = s.games.filter(g => g.platforms.includes(id) && g.releasedAt >= since).reduce((a, g) => a + g.score / 10, 0);
  const theirs = s.market.games.filter(g => g.platform === id && g.releasedAt >= since).reduce((a, g) => a + g.score / 10, 0);
  return mine + theirs;
}

export function weeklyDemand(s: GameState, c: Console): number {
  const age = (s.time - c.launchedAt) / YEAR;
  const life = age < 0.5 ? 0.7 + age * 0.6 : Math.exp(-(age - 0.5) / 4);
  const perf = Math.pow(c.perf / expectedPerf(s, c.form), 1.2);
  const price = Math.pow(referencePrice(s, c.form) / c.price, 1.5);
  const lib = 1 + library(s, c) * 0.04;
  const fans = 1 + Math.sqrt(s.fans) / 300;
  return Math.round(HARDWARE.weeklyDemand * life * perf * price * lib * fans);
}

/** Valeur de marché de la plateforme pour les ventes de jeux (comparable aux consoles du marché). */
export const consoleMarket = (c: Console) => clamp(c.installed / 500000, 0.2, 4);

function consoleWeek(s: GameState) {
  for (const c of s.consoles) {
    if (c.phase !== 'live') { c.weekly = 0; continue; }
    const demand = weeklyDemand(s, c);
    const sold = Math.min(c.stock, demand);
    c.stock -= sold;
    c.weekly = sold;
    c.installed += sold;
    const rev = Math.round(sold * c.price * HARDWARE.retailShare);
    c.revenue += rev;
    book(s, 'consoles', rev);
    if (c.auto && c.stock < demand * 2) orderConsoles(s, c, demand * 4 - c.stock);
    if (demand < 50 && s.time - c.launchedAt > 2 * YEAR) retireConsole(s, c, 'La demande s’est éteinte');
  }
}

export function retireConsole(s: GameState, c: Console, reason = 'Production arrêtée') {
  if (c.phase !== 'live') return;
  c.phase = 'retired';
  c.retiredAt = s.time;
  log(s, `${c.name} : ${reason.toLowerCase()} (${c.installed.toLocaleString('fr-FR')} consoles vendues). Les jeux restent vendus encore un an.`);
}

/** Royalties sur les ventes des jeux concurrents sortis sur vos consoles. */
export function royaltiesFor(s: GameState, platform: string, units: number) {
  if (!isOwnPlatform(platform) || units <= 0) return;
  const c = s.consoles.find(o => consolePlatformId(o) === platform);
  if (!c) return;
  const r = units * HARDWARE.royalty;
  c.royalties += r;
  book(s, 'royalties', r);
}

/* =================== Plateformes dynamiques =================== */

export function ownPlatforms(s: GameState): PlatformDef[] {
  return s.consoles.filter(c => c.phase === 'live' || (c.phase === 'retired' && s.time - c.retiredAt < YEAR)).map(c => ({
    id: consolePlatformId(c), name: c.name, from: yearOfTime(c.launchedAt),
    to: c.phase === 'retired' ? yearOfTime(c.retiredAt) + 1 : 2200,
    market: consoleMarket(c), license: 0, likes: [], dislikes: [],
  }));
}

/** Toutes les plateformes connues, y compris vos consoles (même retirées, pour l'affichage). */
export function getPlatform(s: GameState, id: string): PlatformDef | undefined {
  if (PLATFORM[id]) return PLATFORM[id];
  const c = s.consoles.find(o => consolePlatformId(o) === id);
  return c ? { id, name: c.name, from: yearOfTime(c.launchedAt), to: 2200, market: consoleMarket(c), license: 0, likes: [], dislikes: [] } : undefined;
}
export const platformName = (s: GameState, id: string) => getPlatform(s, id)?.name ?? id;

export function allAvailablePlatforms(s: GameState): PlatformDef[] {
  const y = yearNow(s);
  return [...PLATFORMS.filter(p => p.from <= y && y < p.to), ...ownPlatforms(s).filter(p => p.to > y)];
}

export function hardwareWeek(s: GameState) {
  consoleWeek(s);
}
