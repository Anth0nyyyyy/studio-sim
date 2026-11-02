import { FURN, NAMES, ROOMS, isWorkRoom } from '../core/data';
import { log } from '../core/log';
import { DAY_SEC } from '../core/time';
import { SKILLS, type Employee, type GameState, type NeedKind, type Skill } from '../core/types';
import { clamp, pick, rnd, rint } from '../core/util';
import { roomBoost, roomComfort } from './build';
import { canStep, roomAt, seatsOf } from './grid';
import { findPath } from './pathfinding';

const SPEED = 3; // tuiles par seconde simulée
const RATE = {
  hunger: 22 / DAY_SEC,
  bladder: 28 / DAY_SEC,
  fatigueWork: 20 / DAY_SEC,
  fatigueIdle: 5 / DAY_SEC,
};
const THRESHOLD: Record<NeedKind, number> = { bladder: 75, hunger: 75, fatigue: 80 };
export const HIRE_FEE_RATIO = 0.5;

export function genCandidate(s: GameState, level = 1): Employee {
  const spec = pick(SKILLS);
  const second = pick(SKILLS.filter(k => k !== spec));
  const skills = {} as Record<Skill, number>;
  for (const k of SKILLS) skills[k] = rint(3, 30);
  skills[spec] = clamp(Math.round(rnd(30, 70) * level), 1, 100);
  skills[second] = clamp(Math.round(rnd(20, 50) * level), 1, 100);
  const others = SKILLS.reduce((a, k) => a + skills[k], 0) / SKILLS.length;
  const salary = Math.round((1200 + (skills[spec] * 0.7 + others * 0.3) * 45) / 50) * 50;
  return {
    id: s.nextId++, name: `${pick(NAMES.first)} ${pick(NAMES.last)}`, spec, skills, salary,
    motivation: rint(55, 80), fatigue: rint(0, 20), hunger: rint(0, 40), bladder: rint(0, 40),
    x: s.entrance[0] + 0.5, y: s.entrance[1] + 0.5, path: [],
    state: 'idle', goal: null, using: null, room: null, desk: null, timer: 0, missing: null, rate: 0,
  };
}

export const hireFee = (e: Employee) => Math.round(e.salary * HIRE_FEE_RATIO);

export function hire(s: GameState, candId: number, free = false): boolean {
  const c = s.candidates.find(o => o.id === candId);
  if (!c) return false;
  if (!free && s.money < hireFee(c)) return false;
  if (!free) s.money -= hireFee(c);
  s.candidates = s.candidates.filter(o => o !== c);
  c.x = s.entrance[0] + 0.5; c.y = s.entrance[1] + 0.5;
  s.employees.push(c);
  autoAssign(s, c);
  log(s, `${c.name} rejoint le studio.`);
  return true;
}

export function fire(s: GameState, empId: number) {
  const e = s.employees.find(o => o.id === empId);
  if (!e) return;
  releaseAll(s, e);
  s.employees = s.employees.filter(o => o !== e);
  log(s, `${e.name} a quitté le studio.`);
}

function releaseAll(s: GameState, e: Employee) {
  for (const f of s.furniture) {
    if (f.owner === e.id) f.owner = null;
    if (f.user === e.id) f.user = null;
  }
  e.desk = null; e.using = null;
}

export function freeDeskIn(s: GameState, roomId: number) {
  return s.furniture.find(f => f.room === roomId && FURN[f.type].use === 'work' && f.owner === null);
}

export function assignRoom(s: GameState, e: Employee, roomId: number | null) {
  for (const f of s.furniture) if (f.owner === e.id) f.owner = null;
  e.desk = null; e.room = roomId;
  if (e.state === 'working' || e.goal === 'desk') { e.state = 'idle'; e.goal = null; e.path = []; }
  if (roomId !== null) claimDesk(s, e);
}

function claimDesk(s: GameState, e: Employee) {
  if (e.room === null || e.desk !== null) return;
  const d = freeDeskIn(s, e.room);
  if (d) { d.owner = e.id; e.desk = d.id; }
}

/** Affecte à une salle de travail qui correspond à la spécialité, avec un poste libre. */
export function autoAssign(s: GameState, e: Employee) {
  const work = s.rooms.filter(r => isWorkRoom(r.type) && freeDeskIn(s, r.id));
  const best = work.find(r => ROOMS[r.type].skills!.includes(e.spec)) ?? work[0];
  if (best) assignRoom(s, e, best.id);
}

export function roomSkill(e: Employee, roomType: string): number {
  const sk = ROOMS[roomType].skills;
  if (!sk) return 0;
  return sk.reduce((a, k) => a + e.skills[k], 0) / sk.length;
}

function urgentNeed(e: Employee): NeedKind | null {
  if (e.bladder >= THRESHOLD.bladder) return 'bladder';
  if (e.hunger >= THRESHOLD.hunger) return 'hunger';
  if (e.fatigue >= THRESHOLD.fatigue) return 'fatigue';
  return null;
}

const tileOf = (e: Employee): [number, number] => [Math.floor(e.x), Math.floor(e.y)];

function goTo(s: GameState, e: Employee, goals: [number, number][], goal: Employee['goal']): boolean {
  const [tx, ty] = tileOf(e);
  const p = findPath(s, tx, ty, goals);
  if (!p) return false;
  e.path = p; e.goal = goal; e.state = 'walking';
  if (!p.length) arrive(s, e);
  return true;
}

function deskSeats(s: GameState, e: Employee): [number, number][] {
  const d = s.furniture.find(f => f.id === e.desk);
  return d ? seatsOf(s, d.x, d.y, d.room) : [];
}

function decide(s: GameState, e: Employee) {
  e.missing = null;
  const need = urgentNeed(e);
  if (need) {
    const spots = s.furniture
      .filter(f => FURN[f.type].use === need && f.user === null)
      .flatMap(f => seatsOf(s, f.x, f.y, f.room));
    if (spots.length && goTo(s, e, spots, need)) return;
    e.missing = need;
  }
  claimDesk(s, e);
  if (e.desk !== null) {
    if (goTo(s, e, deskSeats(s, e), 'desk')) return;
  }
  // flâne dans le couloir
  e.timer -= 1;
  if (e.timer > 0) return;
  e.timer = rint(120, 300);
  const corridor: [number, number][] = [];
  const { x0, y0, x1, y1 } = s.lot;
  for (let i = 0; i < 12; i++) {
    const x = rint(x0, x1), y = rint(y0, y1);
    if (roomAt(s, x, y) === 0) corridor.push([x, y]);
  }
  if (corridor.length) goTo(s, e, [pick(corridor)], 'wander');
}

function arrive(s: GameState, e: Employee) {
  e.path = [];
  const [tx, ty] = tileOf(e);
  if (e.goal === 'desk') {
    const d = s.furniture.find(f => f.id === e.desk);
    if (d && Math.abs(d.x - tx) + Math.abs(d.y - ty) === 1) { e.state = 'working'; return; }
  } else if (e.goal && e.goal !== 'wander') {
    const kind = e.goal;
    const f = s.furniture.find(o =>
      FURN[o.type].use === kind && o.user === null && o.room === roomAt(s, tx, ty) &&
      Math.abs(o.x - tx) + Math.abs(o.y - ty) === 1);
    if (f) {
      f.user = e.id; e.using = f.id; e.state = 'using'; e.timer = FURN[f.type].duration ?? 2;
      return;
    }
  }
  e.state = 'idle'; e.goal = null;
}

function stepWalk(s: GameState, e: Employee, dt: number) {
  let move = SPEED * dt;
  while (move > 0 && e.path.length) {
    const [nx, ny] = e.path[0];
    const [cx, cy] = tileOf(e);
    if ((nx !== cx || ny !== cy) && !canStep(s, cx, cy, nx, ny)) {
      // le plan a changé : on recalcule
      e.path = []; e.state = 'idle'; e.goal = null;
      return;
    }
    const tx = nx + 0.5, ty = ny + 0.5;
    const dx = tx - e.x, dy = ty - e.y;
    const d = Math.hypot(dx, dy);
    if (d <= move) { e.x = tx; e.y = ty; e.path.shift(); move -= d; }
    else { e.x += (dx / d) * move; e.y += (dy / d) * move; move = 0; }
  }
  if (!e.path.length) arrive(s, e);
}

export function updateEmployees(s: GameState, dt: number) {
  for (const e of s.employees) {
    e.hunger = clamp(e.hunger + RATE.hunger * dt, 0, 100);
    e.bladder = clamp(e.bladder + RATE.bladder * dt, 0, 100);
    e.fatigue = clamp(e.fatigue + (e.state === 'working' ? RATE.fatigueWork : RATE.fatigueIdle) * dt, 0, 100);

    const room = s.rooms.find(r => r.id === e.room);
    let target = 50 + (room ? roomComfort(s, room) : 0) * 0.8;
    if (e.desk === null) target -= 12;
    for (const k of ['hunger', 'bladder', 'fatigue'] as const) if (e[k] > 90) target -= 15;
    e.motivation = clamp(e.motivation + (target - e.motivation) * Math.min(1, dt * 0.05), 0, 100);

    e.rate = 0;
    switch (e.state) {
      case 'walking':
        stepWalk(s, e, dt);
        break;
      case 'working': {
        const need = urgentNeed(e);
        const canFix = need && s.furniture.some(f => FURN[f.type].use === need && f.user === null);
        if (canFix || e.desk === null) { e.state = 'idle'; e.goal = null; break; }
        e.missing = need;
        const r = room!;
        const eff = (roomSkill(e, r.type) / 100) * (0.4 + e.motivation / 125) * (1 - e.fatigue / 250) * (1 + roomBoost(s, r.id));
        e.rate = eff;
        const out = ROOMS[r.type].out!;
        s.output[out] = (s.output[out] ?? 0) + eff * dt;
        break;
      }
      case 'using': {
        const f = s.furniture.find(o => o.id === e.using);
        if (!f) { e.state = 'idle'; e.using = null; break; }
        const kind = FURN[f.type].use as NeedKind;
        const dur = FURN[f.type].duration ?? 2;
        e[kind] = clamp(e[kind] - (100 / dur) * dt, 0, 100);
        if (f.type === 'arcade') e.motivation = clamp(e.motivation + 4 * dt, 0, 100);
        e.timer -= dt;
        if (e.timer <= 0) { f.user = null; e.using = null; e[kind] = Math.min(e[kind], 5); e.state = 'idle'; e.goal = null; }
        break;
      }
      case 'idle':
        decide(s, e);
        break;
    }
  }
}

export function stateLabel(s: GameState, e: Employee): string {
  if (e.state === 'working') return 'Au travail';
  if (e.state === 'using') return e.using && s.furniture.find(f => f.id === e.using)?.type === 'arcade' ? 'Joue à l’arcade' : 'En pause';
  if (e.state === 'walking') {
    if (e.goal === 'desk') return 'Va à son poste';
    if (e.goal === 'wander') return 'Se promène';
    return 'Va en pause';
  }
  if (e.room === null) return 'Sans affectation';
  if (e.desk === null) return 'Pas de poste libre';
  return 'Inactif';
}
