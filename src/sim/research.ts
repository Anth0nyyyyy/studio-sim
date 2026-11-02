import { ENGINE_CAT_LABEL, GENRE, LOCKED_TOPICS, RESEARCH, RESEARCH_BY_ID, TOPICS } from '../core/data';
import { log } from '../core/log';
import { DAY_SEC } from '../core/time';
import { ENGINE_CATS, type Engine, type EngineCat, type GameState, type ResearchDef } from '../core/types';
import { money } from '../core/util';
import { year } from './project';
import { book } from '../core/ledger';
import { licenseClients } from './market';

export type ResearchStatus = 'done' | 'open' | 'locked';

export const startingTopics = () => TOPICS.map(t => t.name).filter(n => !LOCKED_TOPICS.has(n));
export const baseResearch = () => Object.fromEntries(RESEARCH.filter(r => r.base).map(r => [r.id, true as const]));

export function researchStatus(s: GameState, r: ResearchDef): ResearchStatus {
  if (s.done[r.id]) return 'done';
  if (r.req.some(q => !s.done[q]) || year(s) < r.year) return 'locked';
  return 'open';
}

export function lockReason(s: GameState, r: ResearchDef): string {
  const parts = r.req.filter(q => !s.done[q]).map(q => RESEARCH_BY_ID[q].name);
  if (year(s) < r.year) parts.push(`l’année ${r.year}`);
  return parts.join(', ');
}

export function buyResearch(s: GameState, id: string): string | null {
  const r = RESEARCH_BY_ID[id];
  if (!r) return 'Recherche inconnue';
  const st = researchStatus(s, r);
  if (st === 'done') return 'Déjà acquis';
  if (st === 'locked') return `Requiert : ${lockReason(s, r)}`;
  if (s.rp < r.rp) return 'Points de recherche insuffisants';
  if (s.money < r.money) return 'Fonds insuffisants';
  s.rp -= r.rp;
  book(s, 'recherche', -r.money);
  s.done[id] = true;
  if (r.topics) for (const t of r.topics) if (!s.topics.includes(t)) s.topics.push(t);
  log(s, `Recherche terminée : ${r.name}.`);
  return null;
}

/* ---------- Bonus de studio ---------- */
export const maxPlatforms = (s: GameState) => 1 + (s.done.port ? 1 : 0) + (s.done.multi ? 1 : 0);
export const sizeUnlocked = (s: GameState, size: 'S' | 'M' | 'L') => size === 'S' || (size === 'M' ? !!s.done.sizeM : !!s.done.sizeL);
export const bugMult = (s: GameState) => (s.done.agile ? 0.75 : 1);
export const qaMult = (s: GameState) => (s.done.qatools ? 1.3 : 1);
export const assetMult = (s: GameState) => (s.done.pipeline ? 1.2 : 1);
export const hypeMult = (s: GameState) => (s.done.massmkt ? 1.3 : 1);
export const motivationBonus = (s: GameState) => (s.done.ergo ? 8 : 0);

/* ---------- Moteurs ---------- */
export const featureValue = (id: string) => RESEARCH_BY_ID[id]?.value ?? 0;

export function featuresFor(s: GameState, cat: EngineCat): ResearchDef[] {
  return RESEARCH.filter(r => r.cat === cat && s.done[r.id]);
}
export function bestFeatures(s: GameState): Record<EngineCat, string> {
  return Object.fromEntries(ENGINE_CATS.map(c => {
    const list = featuresFor(s, c);
    return [c, list[list.length - 1].id];
  })) as Record<EngineCat, string>;
}

export const engineTech = (features: Record<EngineCat, string>) =>
  ENGINE_CATS.reduce((a, c) => a + featureValue(features[c]), 0);
export const engineCost = (features: Record<EngineCat, string>) => Math.round((5000 + engineTech(features) * 3000) / 500) * 500;
export const engineDays = (features: Record<EngineCat, string>) => Math.round(8 + engineTech(features) * 1.5);
export const engineReady = (s: GameState, e: Engine) => s.time >= e.readyAt;
export const engineBuilding = (s: GameState) => s.engines.find(e => !engineReady(s, e));

export function createEngine(s: GameState, name: string, features: Record<EngineCat, string>, free = false): string | null {
  if (!name.trim()) return 'Donnez un nom au moteur';
  const building = engineBuilding(s);
  if (building && !free) return `${building.name} est déjà en construction`;
  for (const c of ENGINE_CATS) {
    const r = RESEARCH_BY_ID[features[c]];
    if (!r || r.cat !== c || !s.done[r.id]) return `Fonction ${ENGINE_CAT_LABEL[c]} non recherchée`;
  }
  const cost = engineCost(features);
  if (!free && s.money < cost) return 'Fonds insuffisants';
  if (!free) book(s, 'développement', -cost);
  const e: Engine = {
    id: s.nextId++, name: name.trim(), features: { ...features }, tech: engineTech(features), cost,
    readyAt: free ? s.time : s.time + engineDays(features) * DAY_SEC, licensed: false, licenseIncome: 0,
  };
  s.engines.push(e);
  if (!free) log(s, `Construction du moteur ${e.name} lancée (${engineDays(features)} jours).`);
  return null;
}

/** Meilleure valeur disponible dans une catégorie à l'année courante (attente du marché). */
function expectedValue(s: GameState, cat: EngineCat): number {
  const y = year(s);
  const list = RESEARCH.filter(r => r.cat === cat && r.year <= y);
  return Math.max(1, (list[list.length - 1]?.value ?? 1) * 0.85);
}

/** Rapport technologie du moteur / attente du marché, pondéré par le genre (1 = à jour). */
export function engineRatio(s: GameState, e: Engine, genre: string): number {
  const w = GENRE[genre].engine;
  let have = 0, want = 0;
  for (const c of ENGINE_CATS) {
    have += w[c] * featureValue(e.features[c]);
    want += w[c] * expectedValue(s, c);
  }
  return have / want;
}
export const engineQualityMult = (ratio: number) => Math.max(0.7, Math.min(1.3, 0.7 + 0.3 * ratio));
/** Charge de travail supplémentaire liée à la richesse du moteur. */
export const engineWorkload = (e: Engine) => 1 + Math.min(0.6, e.tech * 0.015);

export function setLicensed(s: GameState, engineId: number, on: boolean): string | null {
  if (on && !s.done.enginelic) return 'Recherchez d’abord « Licences de moteur »';
  const e = s.engines.find(o => o.id === engineId);
  if (!e) return 'Moteur introuvable';
  e.licensed = on;
  return null;
}

/** Revenus mensuels des licences : les moteurs récents et riches rapportent plus. */
export function monthlyLicenses(s: GameState): number {
  let total = 0;
  for (const e of s.engines) {
    if (!e.licensed || !engineReady(s, e)) continue;
    const clients = licenseClients(s, engineRatio(s, e, 'Action'));
    const inc = Math.round(clients * e.tech * 150);
    e.licenseIncome += inc;
    total += inc;
  }
  if (total > 0) {
    book(s, 'licences', total);
    log(s, `Licences de moteur : +${money(total)}.`);
  }
  return total;
}
