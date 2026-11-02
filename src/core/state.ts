import { invalidate } from '../sim/grid';
import { createRoom, placeFurniture } from '../sim/build';
import { genCandidate, hire } from '../sim/employees';
import { CANDIDATES } from '../sim/tick';
import { baseResearch, bestFeatures, createEngine, startingTopics } from '../sim/research';
import { log } from './log';
import type { GameState, Market } from './types';
import { initMarket } from '../sim/market';
import { genPublishOffer, refreshContractOffers } from '../sim/business';

export const SAVE_KEY = 'studio-sim-save';
export const SAVE_VERSION = 8;

/** Met à niveau une sauvegarde ancienne. */
function migrate(s: GameState): GameState {
  if (s.version === 1) {
    s.project = null; s.games = []; s.fans = 0; s.rp = 0; s.best = 0; s.know = {}; s.combos = {};
    s.version = 2;
  }
  if (s.version === 2) {
    s.done = baseResearch();
    s.topics = startingTopics();
    s.engines = [];
    createEngine(s, 'Moteur maison', bestFeatures(s), true);
    if (s.project) s.project.engine = s.engines[0].id;
    for (const g of s.games) g.engine = s.engines[0].id;
    s.version = 3;
  }
  if (s.version === 3) {
    s.fansGenre = {};
    const total = s.games.reduce((a, g) => a + g.units, 0) || 1;
    for (const g of s.games) { g.weekly = 0; s.fansGenre[g.genre] = (s.fansGenre[g.genre] ?? 0) + s.fans * g.units / total; }
    s.market = initMarket(s);
    s.version = 4;
  }
  if (s.version === 4) {
    Object.assign(s, { ledger: [], contracts: [], contractOffers: [], publishOffers: [], published: [], loans: [], shares: {} });
    s.market.monthUnits = {};
    if (s.project) s.project.price = 1;
    for (const g of s.games) {
      Object.assign(g, { price: 1, collector: 0, lost: 0, digital: 0, auto: true });
      g.stock = Math.round(g.sched.slice(g.si).reduce((a, v) => a + v, 0));
    }
    refreshContractOffers(s);
    s.version = 5;
  }
  if (s.version === 5) {
    Object.assign(s, { live: [], patch: null, supportWeek: 0, supportRatio: 1 });
    if (s.project) Object.assign(s.project, { kind: 'new', base: null, model: 'boxed' });
    for (const g of s.games) Object.assign(g, { kind: 'new', base: null, model: 'boxed', bugs: 0, patched: false });
    s.version = 6;
  }
  if (s.version === 6) {
    s.consoles = [];
    s.version = 7;
  }
  if (s.version === 7) {
    Object.assign(s, { achievements: [], tutorial: -1, negMonths: 0, status: 'playing', pendingEvent: null });
    s.version = 8;
  }
  return s;
}

export function emptyState(W = 48, H = 34): GameState {
  const lot = { x0: 2, y0: 2, x1: W - 3, y1: H - 3 };
  const roomMap: number[] = [];
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++)
      roomMap.push(x >= lot.x0 && x <= lot.x1 && y >= lot.y0 && y <= lot.y1 ? 0 : -1);
  const s: GameState = {
    version: SAVE_VERSION, W, H, lot,
    entrance: [Math.floor((lot.x0 + lot.x1) / 2), lot.y1],
    roomMap, rooms: [], furniture: [], doors: [], employees: [], candidates: [],
    money: 0, time: 0, nextId: 1, output: {}, log: [], lastMonth: 0, lastWeek: 0,
    project: null, games: [], fans: 0, rp: 0, best: 0, know: {}, combos: {},
    done: baseResearch(), topics: startingTopics(), engines: [],
    fansGenre: {}, market: null as unknown as Market,
    ledger: [], contracts: [], contractOffers: [], publishOffers: [], published: [], loans: [], shares: {},
    live: [], patch: null, supportWeek: 0, supportRatio: 1, consoles: [],
    achievements: [], tutorial: 0, negMonths: 0, status: 'playing', pendingEvent: null,
  };
  s.market = initMarket(s);
  return s;
}

/** Nouvelle partie avec un petit studio de départ. */
export function newGame(): GameState {
  const s = emptyState();
  invalidate();
  createEngine(s, 'Moteur maison', bestFeatures(s), true);
  const [ex, ey] = s.entrance;
  createRoom(s, 'dev', ex - 7, ey - 7, 7, 5, true);
  createRoom(s, 'wc', ex + 2, ey - 6, 3, 3, true);
  createRoom(s, 'cafe', ex + 6, ey - 7, 4, 4, true);
  const dev = s.rooms[0], wc = s.rooms[1], cafe = s.rooms[2];
  for (let i = 0; i < 3; i++) placeFurniture(s, 'desk', dev.x + 1 + i * 2, dev.y + 1, true);
  placeFurniture(s, 'plant', dev.x, dev.y, true);
  placeFurniture(s, 'board', dev.x + dev.w - 1, dev.y, true);
  placeFurniture(s, 'toilet', wc.x + 1, wc.y, true);
  placeFurniture(s, 'coffee', cafe.x + cafe.w - 1, cafe.y, true);
  placeFurniture(s, 'plant', cafe.x, cafe.y, true);
  for (let i = 0; i < CANDIDATES; i++) s.candidates.push(genCandidate(s));
  const devs = s.candidates.filter(c => c.spec === 'design' || c.spec === 'prog');
  for (const c of [...new Set([...devs, ...s.candidates])].slice(0, 2)) hire(s, c.id, true);
  while (s.candidates.length < CANDIDATES) s.candidates.push(genCandidate(s));
  s.money = 120000;
  s.rp = 25;
  refreshContractOffers(s);
  s.publishOffers = [genPublishOffer(s)];
  s.log = [];
  log(s, 'Bienvenue ! Construisez des salles, meublez-les et recrutez votre équipe.');
  return s;
}

export function saveLocal(s: GameState): boolean {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(s)); return true; } catch { return false; }
}

export function parseSave(raw: string): GameState | null {
  try {
    const s = migrate(JSON.parse(raw) as GameState);
    if (s.version !== SAVE_VERSION || !Array.isArray(s.roomMap)) return null;
    invalidate();
    return s;
  } catch { return null; }
}

export function loadLocal(): GameState | null {
  try { const r = localStorage.getItem(SAVE_KEY); return r ? parseSave(r) : null; } catch { return null; }
}
