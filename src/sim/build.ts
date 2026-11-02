import { FURN, ROOMS, isWorkRoom } from '../core/data';
import { log } from '../core/log';
import type { Furniture, GameState, Room } from '../core/types';
import { book } from '../core/ledger';
import { DIRS, edgeKey, furnAt, idx, invalidate, reachableFromEntrance, roomAt, seatsOf } from './grid';

export type Result = { ok: true; cost: number } | { ok: false; cost: number; reason: string };
const fail = (reason: string, cost = 0): Result => ({ ok: false, cost, reason });

export const DOOR_COST = 500;
export const REFUND_ROOM = 0.3;
export const REFUND_FURN = 0.5;

export function normRect(ax: number, ay: number, bx: number, by: number) {
  return { x: Math.min(ax, bx), y: Math.min(ay, by), w: Math.abs(bx - ax) + 1, h: Math.abs(by - ay) + 1 };
}

/**
 * Vérifie que chaque salle est atteignable depuis l'entrée
 * et que chaque meuble utilisable a une place libre atteignable.
 */
export function layoutOk(s: GameState): boolean {
  const reach = reachableFromEntrance(s);
  for (const r of s.rooms) {
    let any = false;
    for (let y = r.y; y < r.y + r.h && !any; y++)
      for (let x = r.x; x < r.x + r.w; x++) if (reach[idx(s, x, y)]) { any = true; break; }
    if (!any) return false;
  }
  for (const f of s.furniture) {
    if (!FURN[f.type].use) continue;
    if (!seatsOf(s, f.x, f.y, f.room).some(([x, y]) => reach[idx(s, x, y)])) return false;
  }
  return true;
}

/** Applique une modification, vérifie le plan, annule si invalide. */
function tryLayout(s: GameState, apply: () => void, revert: () => void): boolean {
  apply(); invalidate();
  const ok = layoutOk(s);
  if (!ok) { revert(); invalidate(); }
  return ok;
}

function perimeterEdges(r: { x: number; y: number; w: number; h: number }) {
  const e: { ix: number; iy: number; ox: number; oy: number }[] = [];
  for (let x = r.x; x < r.x + r.w; x++) {
    e.push({ ix: x, iy: r.y + r.h - 1, ox: x, oy: r.y + r.h });
    e.push({ ix: x, iy: r.y, ox: x, oy: r.y - 1 });
  }
  for (let y = r.y; y < r.y + r.h; y++) {
    e.push({ ix: r.x, iy: y, ox: r.x - 1, oy: y });
    e.push({ ix: r.x + r.w - 1, iy: y, ox: r.x + r.w, oy: y });
  }
  return e;
}

export function validateRoom(s: GameState, type: string, x: number, y: number, w: number, h: number): Result {
  const def = ROOMS[type];
  const cost = def.costTile * w * h;
  const [a, b] = def.min;
  if (!((w >= a && h >= b) || (w >= b && h >= a))) return fail(`Taille minimale ${a}×${b}`, cost);
  for (let ty = y; ty < y + h; ty++)
    for (let tx = x; tx < x + w; tx++) {
      const r = roomAt(s, tx, ty);
      if (r < 0) return fail('Hors du terrain', cost);
      if (r > 0) return fail('Chevauche une salle', cost);
      if (tx === s.entrance[0] && ty === s.entrance[1]) return fail('Bloque l’entrée', cost);
    }
  if (s.money < cost) return fail('Fonds insuffisants', cost);
  return { ok: true, cost };
}

export function createRoom(s: GameState, type: string, x: number, y: number, w: number, h: number, free = false): Result {
  const v = validateRoom(s, type, x, y, w, h);
  if (!v.ok && !(free && v.reason === 'Fonds insuffisants')) return v;
  const id = s.nextId++;
  const room: Room = { id, type, x, y, w, h, cost: v.cost };
  const tiles: number[] = [];
  for (let ty = y; ty < y + h; ty++) for (let tx = x; tx < x + w; tx++) tiles.push(idx(s, tx, ty));

  const reach = reachableFromEntrance(s);
  const cx = x + (w - 1) / 2;
  const [ex, ey] = s.entrance;
  const candidates = perimeterEdges(room)
    .filter(e => roomAt(s, e.ox, e.oy) === 0 && furnAt(s, e.ox, e.oy) === 0 && reach[idx(s, e.ox, e.oy)])
    .sort((p, q) =>
      (Math.abs(p.ox - ex) + Math.abs(p.oy - ey) + Math.abs(p.ix - cx) * 0.5) -
      (Math.abs(q.ox - ex) + Math.abs(q.oy - ey) + Math.abs(q.ix - cx) * 0.5));

  for (const e of candidates) {
    const key = edgeKey(e.ix, e.iy, e.ox, e.oy);
    const ok = tryLayout(s,
      () => { tiles.forEach(t => (s.roomMap[t] = id)); s.rooms.push(room); s.doors.push(key); },
      () => { tiles.forEach(t => (s.roomMap[t] = 0)); s.rooms.pop(); s.doors.pop(); });
    if (ok) {
      if (!free) book(s, 'construction', -v.cost);
      log(s, `Salle construite : ${ROOMS[type].name} (${w}×${h}).`);
      return { ok: true, cost: v.cost };
    }
  }
  return fail(candidates.length ? 'Couperait l’accès à une autre salle' : 'Aucun accès au couloir', v.cost);
}

export function demolishRoom(s: GameState, roomId: number) {
  const room = s.rooms.find(r => r.id === roomId);
  if (!room) return;
  let refund = room.cost * REFUND_ROOM;
  for (const f of s.furniture.filter(f => f.room === roomId)) {
    refund += FURN[f.type].cost * REFUND_FURN;
    detachFurniture(s, f);
  }
  s.furniture = s.furniture.filter(f => f.room !== roomId);
  for (let y = room.y; y < room.y + room.h; y++) for (let x = room.x; x < room.x + room.w; x++) s.roomMap[idx(s, x, y)] = 0;
  s.rooms = s.rooms.filter(r => r !== room);
  // portes devenues inutiles (même zone des deux côtés)
  s.doors = s.doors.filter(k => {
    const [xs, ys, d] = k.split(',');
    const x = +xs, y = +ys;
    const [nx, ny] = d === 'E' ? [x + 1, y] : [x, y + 1];
    return roomAt(s, x, y) !== roomAt(s, nx, ny);
  });
  for (const e of s.employees) if (e.room === roomId) { e.room = null; e.desk = null; }
  book(s, 'reventes', refund);
  invalidate();
  log(s, `Salle démolie : ${ROOMS[room.type].name} (+${Math.round(refund)} $).`);
}

/** Arête visée selon la position de la souris dans la tuile (fx, fy entre 0 et 1). */
export function edgeFromPointer(x: number, y: number, fx: number, fy: number): [number, number, number, number] {
  const d = [fy, 1 - fy, fx, 1 - fx];
  const m = d.indexOf(Math.min(...d));
  const [dx, dy] = [[0, -1], [0, 1], [-1, 0], [1, 0]][m];
  return [x, y, x + dx, y + dy];
}

export function toggleDoor(s: GameState, x: number, y: number, nx: number, ny: number): Result {
  const a = roomAt(s, x, y), b = roomAt(s, nx, ny);
  if (a < 0 || b < 0) return fail('Mur extérieur');
  if (a === b) return fail('Pas de mur ici');
  if (furnAt(s, x, y) || furnAt(s, nx, ny)) return fail('Un meuble bloque le passage');
  const key = edgeKey(x, y, nx, ny);
  const i = s.doors.indexOf(key);
  if (i >= 0) {
    const ok = tryLayout(s, () => s.doors.splice(i, 1), () => s.doors.splice(i, 0, key));
    if (!ok) return fail('Dernier accès d’une salle');
    log(s, 'Porte retirée.');
    return { ok: true, cost: 0 };
  }
  if (s.money < DOOR_COST) return fail('Fonds insuffisants', DOOR_COST);
  s.doors.push(key);
  book(s, 'construction', -DOOR_COST);
  invalidate();
  return { ok: true, cost: DOOR_COST };
}

function touchesDoor(s: GameState, x: number, y: number) {
  return DIRS.some(([dx, dy]) => s.doors.includes(edgeKey(x, y, x + dx, y + dy)));
}

export function validateFurniture(s: GameState, type: string, x: number, y: number): Result {
  const def = FURN[type];
  const r = roomAt(s, x, y);
  if (r <= 0) return fail('À placer dans une salle', def.cost);
  const room = s.rooms.find(o => o.id === r)!;
  if (!def.rooms.includes('*') && !def.rooms.includes(room.type)) return fail(`Pas dans : ${ROOMS[room.type].name}`, def.cost);
  if (def.rooms.includes('*') && def.use === 'work' && !isWorkRoom(room.type)) return fail('Salle de travail requise', def.cost);
  if (furnAt(s, x, y)) return fail('Emplacement occupé', def.cost);
  if (touchesDoor(s, x, y)) return fail('Bloque une porte', def.cost);
  if (s.employees.some(e => e.state === 'working' && Math.floor(e.x) === x && Math.floor(e.y) === y)) return fail('Un employé travaille ici', def.cost);
  if (s.money < def.cost) return fail('Fonds insuffisants', def.cost);
  return { ok: true, cost: def.cost };
}

export function placeFurniture(s: GameState, type: string, x: number, y: number, free = false): Result {
  const v = validateFurniture(s, type, x, y);
  if (!v.ok && !(free && v.reason === 'Fonds insuffisants')) return v;
  const f: Furniture = { id: s.nextId++, type, x, y, room: roomAt(s, x, y), owner: null, user: null };
  const ok = tryLayout(s, () => s.furniture.push(f), () => s.furniture.pop());
  if (!ok) { s.nextId--; return fail('Bloquerait un passage', v.cost); }
  if (!free) book(s, 'construction', -v.cost);
  return { ok: true, cost: v.cost };
}

function detachFurniture(s: GameState, f: Furniture) {
  for (const e of s.employees) {
    if (e.desk === f.id) e.desk = null;
    if (e.using === f.id || (e.desk === null && e.state === 'working')) {
      e.using = null; e.state = 'idle'; e.goal = null; e.path = [];
    }
  }
}

export function sellFurniture(s: GameState, fid: number) {
  const f = s.furniture.find(o => o.id === fid);
  if (!f) return;
  detachFurniture(s, f);
  s.furniture = s.furniture.filter(o => o !== f);
  book(s, 'reventes', FURN[f.type].cost * REFUND_FURN);
  invalidate();
}

export function roomComfort(s: GameState, room: Room): number {
  let c = 0;
  for (const f of s.furniture) if (f.room === room.id) c += FURN[f.type].comfort ?? 0;
  return Math.min(40, 8 + c / Math.max(1, (room.w * room.h) / 12));
}

export function roomBoost(s: GameState, roomId: number): number {
  let b = 0;
  for (const f of s.furniture) if (f.room === roomId) b += FURN[f.type].boost ?? 0;
  return Math.min(0.2, b);
}
