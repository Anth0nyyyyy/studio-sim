import { invalidate } from '../sim/grid';
import { createRoom, placeFurniture } from '../sim/build';
import { genCandidate, hire } from '../sim/employees';
import { CANDIDATES } from '../sim/tick';
import { baseResearch, bestFeatures, createEngine, startingTopics } from '../sim/research';
import { log } from './log';
import type { GameState } from './types';

export const SAVE_KEY = 'studio-sim-save';
export const SAVE_VERSION = 3;

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
  return s;
}

export function emptyState(W = 48, H = 34): GameState {
  const lot = { x0: 2, y0: 2, x1: W - 3, y1: H - 3 };
  const roomMap: number[] = [];
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++)
      roomMap.push(x >= lot.x0 && x <= lot.x1 && y >= lot.y0 && y <= lot.y1 ? 0 : -1);
  return {
    version: SAVE_VERSION, W, H, lot,
    entrance: [Math.floor((lot.x0 + lot.x1) / 2), lot.y1],
    roomMap, rooms: [], furniture: [], doors: [], employees: [], candidates: [],
    money: 0, time: 0, nextId: 1, output: {}, log: [], lastMonth: 0, lastWeek: 0,
    project: null, games: [], fans: 0, rp: 0, best: 0, know: {}, combos: {},
    done: baseResearch(), topics: startingTopics(), engines: [],
  };
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
