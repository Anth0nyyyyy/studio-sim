import { BUSINESS, FURN, RIVAL, SIZES } from '../core/data';
import { book } from '../core/ledger';
import { log } from '../core/log';
import { DAY_SEC, START_YEAR, monthIndex, weekIndex } from '../core/time';
import type { Contract, ContractKind, Game, GameState, Loan, PublishOffer } from '../core/types';
import { clamp, money, pick, rint, rnd } from '../core/util';
import { activeRivals, addFans, fanFactor, trendMult } from './market';
import { year } from './project';

const WEEK = 7 * DAY_SEC;
const yearFactor = (s: GameState) => 1 + (year(s) - START_YEAR) * 0.08;

/* =================== Distribution physique / digitale =================== */

export const PRICE_LEVELS: { value: number; label: string }[] = [
  { value: 0.7, label: 'Bas' }, { value: 1, label: 'Normal' }, { value: 1.3, label: 'Élevé' },
];
export const COLLECTOR_COST = 5;
export const COLLECTOR_MULT = 2.5;
const DIGITAL_BONUS = 1.15;

/** Part du digital dans les ventes : nulle avant 1995, jusqu'à 70 % en 2012. */
export const digitalShare = (s: GameState) => clamp(((year(s) - 1995) / 17) * 0.7, 0, 0.7);
/** Coût de fabrication d'une copie physique. */
export const prodCost = (s: GameState) => Math.max(0.6, 1.6 - (year(s) - START_YEAR) * 0.03);
export const unitPrice = (g: Pick<Game, 'size' | 'price'>) => SIZES[g.size].price * g.price;

/** Les très bons jeux supportent un prix élevé ; les jeux moyens se vendent mieux pas chers. */
export const elasticity = (price: number, score: number) => Math.pow(price, -(1.6 - score * 0.1));

export function capacity(s: GameState): number {
  return BUSINESS.warehouseBase + s.furniture.reduce((a, f) => a + (FURN[f.type].capacity ?? 0), 0);
}
export const stored = (s: GameState) => s.games.reduce((a, g) => a + g.stock + g.collector, 0);

export function orderStock(s: GameState, g: Game, qty: number, collector = false): string | null {
  if (g.si >= g.sched.length) return 'Ce jeu n’est plus en vente';
  const room = capacity(s) - stored(s);
  const n = Math.min(Math.round(qty), room);
  if (n <= 0) return 'Entrepôt plein : construisez un entrepôt et des étagères';
  const cost = Math.round(n * (collector ? COLLECTOR_COST : prodCost(s)));
  if (s.money < cost) return 'Fonds insuffisants';
  book(s, 'production', -cost);
  if (collector) g.collector += n; else g.stock += n;
  return null;
}

/** Demande physique attendue sur les prochaines semaines. */
export function physicalForecast(s: GameState, g: Game, weeks: number): number {
  const e = elasticity(g.price, g.score) * (1 - digitalShare(s));
  return g.sched.slice(g.si, g.si + weeks).reduce((a, v) => a + v * e, 0);
}

export function initialStock(s: GameState, g: Game) {
  const need = physicalForecast(s, g, 4);
  if (need > 0) orderStock(s, g, need);
}

/** Une semaine de ventes pour un jeu du joueur. */
export function sellWeek(s: GameState, g: Game) {
  if (g.si >= g.sched.length) { g.weekly = 0; return; }
  if (g.model === 'f2p') {
    const u = Math.round(g.sched[g.si++] * 2.5);
    g.units += u; g.digital += u; g.weekly = u;
    s.market.yearUnits.player = (s.market.yearUnits.player ?? 0) + u;
    addFans(s, g.genre, u * 0.02 * (g.score / 10));
    if (g.si === g.sched.length) log(s, `${g.name} : fin de la campagne de lancement (${g.units.toLocaleString('fr-FR')} téléchargements).`);
    return;
  }
  const base = g.sched[g.si++] * elasticity(g.price, g.score);
  const d = digitalShare(s);
  const dig = Math.round(base * d);
  const demand = Math.round(base * (1 - d));
  const sold = Math.min(g.stock, demand);
  g.stock -= sold;
  g.lost += demand - sold;
  const collDemand = Math.round(demand * 0.04 * (1 + Math.sqrt(s.fansGenre[g.genre] ?? 0) / 300));
  const coll = Math.min(g.collector, collDemand);
  g.collector -= coll;

  const price = unitPrice(g);
  const revenue = Math.round(sold * price + dig * price * DIGITAL_BONUS + coll * price * COLLECTOR_MULT);
  const u = sold + dig + coll;
  g.units += u; g.digital += dig; g.weekly = u; g.revenue += revenue;
  book(s, 'ventes', revenue);
  s.market.yearUnits.player = (s.market.yearUnits.player ?? 0) + u;
  s.market.monthUnits.player = (s.market.monthUnits.player ?? 0) + u;
  addFans(s, g.genre, u * 0.05 * (g.score / 10) * (g.price < 1 ? 1.3 : g.price > 1 ? 0.8 : 1));

  if (g.si < g.sched.length && g.auto) {
    const next = physicalForecast(s, g, 2);
    if (g.stock < next) orderStock(s, g, physicalForecast(s, g, 4) - g.stock);
  }
  if (g.si === g.sched.length) {
    const unsold = g.stock + g.collector;
    g.stock = 0; g.collector = 0;
    log(s, `${g.name} quitte les rayons : ${g.units.toLocaleString('fr-FR')} ventes, bénéfice ${money(g.revenue - g.cost)}${unsold ? `, ${unsold.toLocaleString('fr-FR')} invendus détruits` : ''}.`);
  }
}

/* =================== Contrats de sous-traitance =================== */

const KIND_LIST: ContractKind[] = ['dev', 'graph', 'son', 'qa'];
export const MAX_CONTRACTS = 2;

export function genContract(s: GameState): Contract {
  const kind = pick(KIND_LIST);
  const amount = Math.round(rnd(30, 140) * (1 + (year(s) - START_YEAR) * 0.05));
  const days = clamp(Math.round(amount / 3 + rnd(4, 12)), 10, 70);
  const pay = Math.round((amount * BUSINESS.contractKinds[kind].rate * yearFactor(s)) / 500) * 500;
  return { id: s.nextId++, client: pick(BUSINESS.clients), kind, amount, progress: 0, days, deadline: 0, pay, penalty: Math.round(pay * 0.5) };
}

export function refreshContractOffers(s: GameState) {
  s.contractOffers = Array.from({ length: 3 }, () => genContract(s));
}

export function acceptContract(s: GameState, id: number): string | null {
  const c = s.contractOffers.find(o => o.id === id);
  if (!c) return 'Offre expirée';
  if (s.contracts.length >= MAX_CONTRACTS) return `${MAX_CONTRACTS} contrats en cours maximum`;
  if (s.contracts.some(o => o.kind === c.kind)) return 'Un contrat de ce type est déjà en cours';
  c.deadline = s.time + c.days * DAY_SEC;
  s.contracts.push(c);
  s.contractOffers = s.contractOffers.filter(o => o !== c);
  log(s, `Contrat signé avec ${c.client} : ${money(c.pay)} à la livraison.`);
  return null;
}

/**
 * Oriente la production d'une salle vers un contrat en cours du même type.
 * Retourne true si les points ont été absorbés par un contrat.
 */
export function contractProduce(s: GameState, kind: string, pts: number): boolean {
  const c = s.contracts.find(o => o.kind === kind);
  if (!c) return false;
  c.progress += pts;
  if (c.progress >= c.amount) {
    book(s, 'contrats', c.pay);
    log(s, `Contrat livré à ${c.client} : +${money(c.pay)}.`);
    s.contracts = s.contracts.filter(o => o !== c);
    addFans(s, 'Casual', 50);
  }
  return true;
}

function checkDeadlines(s: GameState) {
  for (const c of [...s.contracts]) {
    if (s.time <= c.deadline) continue;
    book(s, 'pénalités', -c.penalty);
    s.fans *= 0.98;
    log(s, `Contrat raté avec ${c.client} : pénalité de ${money(c.penalty)}.`);
    s.contracts = s.contracts.filter(o => o !== c);
  }
}

/* =================== Édition de jeux indépendants =================== */

const NAME_A = ['Petit', 'Grand', 'Dernier', 'Secret', 'Lointain', 'Étrange', 'Fragile', 'Brave'];
const NAME_B = ['Voyage', 'Jardin', 'Royaume', 'Phare', 'Labyrinthe', 'Rêve', 'Village', 'Signal'];

export function genPublishOffer(s: GameState): PublishOffer {
  const hidden = rnd(3, 9.5);
  const low = Math.max(1, Math.round(hidden - rnd(0.5, 2)));
  const high = Math.min(10, Math.round(hidden + rnd(0.5, 2)));
  const genres = ['Action', 'Aventure', 'RPG', 'Simulation', 'Stratégie', 'Casual'];
  return {
    id: s.nextId++, indie: pick(BUSINESS.indies), name: `${pick(NAME_A)} ${pick(NAME_B)}`,
    topic: pick(s.topics), genre: pick(genres), low, high, hidden,
    advance: Math.round((20000 * yearFactor(s) * (0.6 + hidden / 10)) / 1000) * 1000,
    share: Math.round(rnd(0.5, 0.7) * 100) / 100, weeks: rint(4, 12), expires: s.time + 6 * WEEK,
  };
}

export function acceptPublish(s: GameState, id: number): string | null {
  const o = s.publishOffers.find(x => x.id === id);
  if (!o) return 'Offre expirée';
  if (s.money < o.advance) return 'Fonds insuffisants';
  book(s, 'édition', -o.advance);
  s.publishOffers = s.publishOffers.filter(x => x !== o);
  s.published.push({
    id: o.id, indie: o.indie, name: o.name, topic: o.topic, genre: o.genre, score: o.hidden, share: o.share, advance: o.advance,
    releaseAt: s.time + o.weeks * WEEK, released: false, units: 0, revenue: 0, sched: [], si: 0, weekly: 0,
  });
  log(s, `Vous éditerez ${o.name} de ${o.indie} (sortie dans ${o.weeks} semaines).`);
  return null;
}

function publishWeek(s: GameState) {
  for (const p of s.published) {
    if (!p.released) {
      if (s.time < p.releaseAt) continue;
      p.released = true;
      p.score = Math.round(clamp(p.score + rnd(-0.7, 0.7), 1, 10) * 10) / 10;
      const total = 15000 * 1.5 * Math.pow(p.score / 10, 2.5) * fanFactor(s, p.genre) * trendMult(s, p.genre, p.topic) * rnd(0.8, 1.2);
      const w = Array.from({ length: 14 }, (_, i) => (i < 2 ? 1 + i * 0.3 : 1.3 * Math.pow(0.82, i - 1)));
      const sum = w.reduce((a, b) => a + b, 0);
      p.sched = w.map(v => (v / sum) * total);
      log(s, `${p.name} (édité par vous) sort : ${p.score.toFixed(1)}/10.`);
    }
    if (p.si < p.sched.length) {
      p.weekly = Math.round(p.sched[p.si++]);
      p.units += p.weekly;
      const rev = Math.round(p.weekly * 8 * p.share);
      p.revenue += rev;
      book(s, 'édition', rev);
      s.market.yearUnits.player = (s.market.yearUnits.player ?? 0) + p.weekly;
    } else p.weekly = 0;
  }
  s.published = s.published.filter(p => !p.released || p.si < p.sched.length || s.time - p.releaseAt < 52 * WEEK);
  s.publishOffers = s.publishOffers.filter(o => o.expires > s.time);
  if (weekIndex(s.time) % 8 === 0) while (s.publishOffers.length < 2) s.publishOffers.push(genPublishOffer(s));
}

/* =================== Banque =================== */

export const debt = (s: GameState) => s.loans.reduce((a, l) => a + l.remaining, 0);

export function yearlyRevenue(s: GameState): number {
  return s.ledger.slice(0, 12).reduce((a, r) => a + (r.lines['ventes'] ?? 0) + (r.lines['licences'] ?? 0) + (r.lines['édition'] ?? 0), 0);
}
export const creditLimit = (s: GameState) => Math.max(100000, Math.round(yearlyRevenue(s) * 1.5 + s.fans * 2));

export function annuity(principal: number, rate = BUSINESS.loanRate, months = BUSINESS.loanMonths) {
  return (principal * rate) / (1 - Math.pow(1 + rate, -months));
}

export function takeLoan(s: GameState, amount: number): string | null {
  if (debt(s) + amount > creditLimit(s)) return `La banque refuse : plafond de ${money(creditLimit(s))} d’encours`;
  const l: Loan = { id: s.nextId++, principal: amount, remaining: amount, rate: BUSINESS.loanRate, monthly: annuity(amount), monthsLeft: BUSINESS.loanMonths };
  s.loans.push(l);
  book(s, 'crédit reçu', amount);
  log(s, `Prêt accordé : ${money(amount)} sur ${BUSINESS.loanMonths} mois.`);
  return null;
}

export function repayLoan(s: GameState, id: number): string | null {
  const l = s.loans.find(o => o.id === id);
  if (!l) return 'Prêt introuvable';
  if (s.money < l.remaining) return 'Fonds insuffisants';
  book(s, 'remboursements', -l.remaining);
  s.loans = s.loans.filter(o => o !== l);
  log(s, 'Prêt remboursé par anticipation.');
  return null;
}

function monthlyLoans(s: GameState) {
  for (const l of [...s.loans]) {
    const interest = l.remaining * l.rate;
    const principal = Math.min(l.remaining, l.monthly - interest);
    book(s, 'intérêts', -Math.round(interest));
    book(s, 'remboursements', -Math.round(principal));
    l.remaining -= principal;
    l.monthsLeft--;
    if (l.monthsLeft <= 0 || l.remaining < 1) s.loans = s.loans.filter(o => o !== l);
  }
}

/* =================== Bourse et rachats =================== */

export function rivalValue(s: GameState, id: string): number {
  const since = s.time - 48 * WEEK;
  const units = s.market.games.filter(g => g.studio === id && g.releasedAt >= since).reduce((a, g) => a + g.units, 0);
  return Math.round((300000 + units * 6) * (RIVAL[id]?.strength ?? 1) * yearFactor(s));
}
export const sharePrice = (s: GameState, id: string) => Math.round((rivalValue(s, id) * BUSINESS.shareStep) / 100);
export const owned = (s: GameState, id: string) => (s.shares[id] ?? 0) >= 100;

export function buyShares(s: GameState, id: string): string | null {
  if (!activeRivals(s).some(r => r.id === id)) return 'Ce studio n’est plus coté';
  if ((s.shares[id] ?? 0) >= 100) return 'Vous possédez déjà tout le studio';
  const cost = Math.round(sharePrice(s, id) * 1.05);
  if (s.money < cost) return 'Fonds insuffisants';
  book(s, 'achats d’actions', -cost);
  s.shares[id] = (s.shares[id] ?? 0) + BUSINESS.shareStep;
  if (s.shares[id] >= 100) log(s, `Rachat complet : ${RIVAL[id].name} devient votre filiale !`);
  else log(s, `Vous détenez ${s.shares[id]} % de ${RIVAL[id].name}.`);
  return null;
}

export function sellShares(s: GameState, id: string): string | null {
  if ((s.shares[id] ?? 0) < BUSINESS.shareStep) return 'Aucune part à vendre';
  book(s, 'ventes d’actions', Math.round(sharePrice(s, id) * 0.95));
  s.shares[id] -= BUSINESS.shareStep;
  return null;
}

function monthlyDividends(s: GameState) {
  let total = 0;
  for (const [id, pct] of Object.entries(s.shares)) {
    if (pct <= 0) continue;
    const profit = (s.market.monthUnits[id] ?? 0) * 8 * 0.25;
    total += Math.round((profit * pct) / 100);
  }
  if (total > 0) { book(s, 'dividendes', total); log(s, `Dividendes : +${money(total)}.`); }
}

/* =================== Crochets de temps =================== */

export function businessWeek(s: GameState) {
  checkDeadlines(s);
  publishWeek(s);
}

export function businessMonth(s: GameState) {
  monthlyLoans(s);
  monthlyDividends(s);
  s.market.monthUnits = {};
  refreshContractOffers(s);
}

export const monthLabelIndex = (s: GameState) => monthIndex(s.time);
