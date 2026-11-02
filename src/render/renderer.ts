import { FURN, ROOMS } from '../core/data';
import { SKILL_HUE, type Employee, type Furniture, type GameState } from '../core/types';
import { doorSet, edgeKey, roomAt } from '../sim/grid';

export const TILE = 32;

export interface Camera { x: number; y: number; zoom: number }
export interface Overlay {
  hover: [number, number] | null;
  rect: { x: number; y: number; w: number; h: number; ok: boolean; label: string } | null;
  tileHint: { x: number; y: number; ok: boolean; label: string } | null;
  edge: [number, number, number, number] | null;
  selected: { kind: 'emp' | 'room' | 'furn'; id: number } | null;
}

const hash = (x: number, y: number) => {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
};

function shade(hex: string, k: number) {
  const n = parseInt(hex.slice(1), 16);
  const f = (c: number) => Math.max(0, Math.min(255, Math.round(c * k)));
  return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
}

export function screenToWorld(cam: Camera, sx: number, sy: number): [number, number] {
  return [cam.x + sx / cam.zoom, cam.y + sy / cam.zoom];
}

export function draw(ctx: CanvasRenderingContext2D, s: GameState, cam: Camera, vw: number, vh: number, dpr: number, ov: Overlay, t: number) {
  const z = cam.zoom * dpr;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#2f4a2b';
  ctx.fillRect(0, 0, vw * dpr, vh * dpr);
  ctx.setTransform(z, 0, 0, z, -cam.x * z, -cam.y * z);
  ctx.imageSmoothingEnabled = false;

  const x0 = Math.max(0, Math.floor(cam.x / TILE) - 1);
  const y0 = Math.max(0, Math.floor(cam.y / TILE) - 1);
  const x1 = Math.min(s.W - 1, Math.ceil((cam.x + vw / cam.zoom) / TILE) + 1);
  const y1 = Math.min(s.H - 1, Math.ceil((cam.y + vh / cam.zoom) / TILE) + 1);
  const roomType = new Map(s.rooms.map(r => [r.id, r.type]));

  // sols
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) {
      const r = roomAt(s, x, y);
      const n = hash(x, y);
      let c: string;
      if (r < 0) c = n > 0.85 ? '#4f7a43' : n > 0.4 ? '#5a8a4b' : '#56844a';
      else if (r === 0) c = (x + y) % 2 ? '#d9d1c2' : '#d2c9b9';
      else c = shade(ROOMS[roomType.get(r)!].color, (x + y) % 2 ? 1 : 0.95);
      ctx.fillStyle = c;
      ctx.fillRect(x * TILE, y * TILE, TILE, TILE);
      if (r < 0 && n > 0.93) { ctx.fillStyle = '#6fa35c'; ctx.fillRect(x * TILE + 10, y * TILE + 12, 3, 6); }
    }

  // paillasson d'entrée
  const [ex, ey] = s.entrance;
  ctx.fillStyle = '#8a5a3b';
  ctx.fillRect(ex * TILE + 4, (ey + 1) * TILE + 2, TILE - 8, 10);

  // murs et portes
  const doors = doorSet(s);
  const WALL = 6;
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) {
      const a = roomAt(s, x, y);
      for (const [nx, ny] of [[x + 1, y], [x, y + 1]] as const) {
        const b = roomAt(s, nx, ny);
        if (a === b) continue;
        const isEntrance = (x === ex && y === ey && ny === ey + 1);
        const door = doors.has(edgeKey(x, y, nx, ny)) || isEntrance;
        const vertical = nx !== x;
        const px = vertical ? nx * TILE - WALL / 2 : x * TILE;
        const py = vertical ? y * TILE : ny * TILE - WALL / 2;
        const w = vertical ? WALL : TILE, h = vertical ? TILE : WALL;
        if (door) {
          ctx.fillStyle = '#3b3440';
          if (vertical) { ctx.fillRect(px, py, w, 5); ctx.fillRect(px, py + h - 5, w, 5); }
          else { ctx.fillRect(px, py, 5, h); ctx.fillRect(px + w - 5, py, 5, h); }
          ctx.fillStyle = isEntrance ? '#c9b48a' : '#a0683f';
          if (vertical) ctx.fillRect(px + 2, py + 5, 2, h - 10); else ctx.fillRect(px + 5, py + 2, w - 10, 2);
        } else {
          ctx.fillStyle = '#3b3440';
          ctx.fillRect(px, py, w, h);
        }
      }
    }

  // meubles
  for (const f of s.furniture) {
    if (f.x < x0 || f.x > x1 || f.y < y0 || f.y > y1) continue;
    drawFurniture(ctx, f, s, t);
  }

  // employés (triés par y pour la profondeur)
  const emps = [...s.employees].sort((a, b) => a.y - b.y);
  for (const e of emps) drawEmployee(ctx, e, t, ov.selected?.kind === 'emp' && ov.selected.id === e.id);

  // sélection
  if (ov.selected?.kind === 'room') {
    const r = s.rooms.find(o => o.id === ov.selected!.id);
    if (r) outline(ctx, r.x * TILE, r.y * TILE, r.w * TILE, r.h * TILE, '#ffb347', 3);
  } else if (ov.selected?.kind === 'furn') {
    const f = s.furniture.find(o => o.id === ov.selected!.id);
    if (f) outline(ctx, f.x * TILE + 1, f.y * TILE + 1, TILE - 2, TILE - 2, '#ffb347', 2);
  }

  if (ov.hover && !ov.rect && !ov.tileHint && !ov.edge) {
    outline(ctx, ov.hover[0] * TILE, ov.hover[1] * TILE, TILE, TILE, 'rgba(255,255,255,.55)', 1.5);
  }
  if (ov.edge) {
    const [ax, ay, bx, by] = ov.edge;
    const vertical = ax !== bx;
    ctx.fillStyle = 'rgba(255,179,71,.9)';
    if (vertical) ctx.fillRect(Math.max(ax, bx) * TILE - 4, ay * TILE, 8, TILE);
    else ctx.fillRect(ax * TILE, Math.max(ay, by) * TILE - 4, TILE, 8);
  }
  if (ov.rect) {
    const { x, y, w, h, ok, label } = ov.rect;
    ctx.fillStyle = ok ? 'rgba(120,220,120,.28)' : 'rgba(255,90,100,.3)';
    ctx.fillRect(x * TILE, y * TILE, w * TILE, h * TILE);
    outline(ctx, x * TILE, y * TILE, w * TILE, h * TILE, ok ? '#7ddc78' : '#ff5d6c', 2);
    tag(ctx, label, x * TILE, y * TILE - 6, ok);
  }
  if (ov.tileHint) {
    const { x, y, ok, label } = ov.tileHint;
    ctx.fillStyle = ok ? 'rgba(120,220,120,.35)' : 'rgba(255,90,100,.35)';
    ctx.fillRect(x * TILE, y * TILE, TILE, TILE);
    tag(ctx, label, x * TILE, y * TILE - 6, ok);
  }
}

function outline(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, c: string, lw: number) {
  ctx.strokeStyle = c; ctx.lineWidth = lw; ctx.strokeRect(x + lw / 2, y + lw / 2, w - lw, h - lw);
}

function tag(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, ok: boolean) {
  ctx.font = '600 12px system-ui, sans-serif';
  const w = ctx.measureText(text).width + 12;
  ctx.fillStyle = ok ? '#1f3b22' : '#4a1d24';
  ctx.fillRect(x, y - 16, w, 18);
  ctx.fillStyle = '#fff';
  ctx.fillText(text, x + 6, y - 3);
}

function drawFurniture(ctx: CanvasRenderingContext2D, f: Furniture, s: GameState, t: number) {
  const X = f.x * TILE, Y = f.y * TILE;
  const R = (c: string, x: number, y: number, w: number, h: number) => { ctx.fillStyle = c; ctx.fillRect(X + x, Y + y, w, h); };
  switch (f.type) {
    case 'desk': {
      R('rgba(0,0,0,.15)', 3, 8, 28, 20);
      R('#8a5a3b', 2, 6, 28, 18);
      R('#a8734d', 2, 6, 28, 3);
      R('#2a2a33', 9, 3, 14, 10);
      const busy = s.employees.some(e => e.desk === f.id && e.state === 'working');
      R(busy ? (Math.floor(t / 300) % 2 ? '#5fd3e6' : '#4bbad0') : '#1b222a', 10, 4, 12, 7);
      R('#d8d2c6', 9, 16, 12, 4);
      break;
    }
    case 'plant':
      R('#a3552f', 10, 18, 12, 10); R('#874322', 10, 18, 12, 2);
      ctx.fillStyle = '#4c8f3e'; ctx.beginPath(); ctx.arc(X + 16, Y + 13, 9, 0, 7); ctx.fill();
      ctx.fillStyle = '#69ad55'; ctx.beginPath(); ctx.arc(X + 13, Y + 10, 5, 0, 7); ctx.fill();
      break;
    case 'board':
      R('#6b6f78', 3, 4, 26, 18); R('#f4f4ef', 5, 6, 22, 14);
      R('#4f8fe0', 8, 9, 10, 1.5); R('#e05a4f', 8, 13, 14, 1.5); R('#3aa55c', 8, 17, 7, 1.5);
      break;
    case 'clim':
      R('#9aa3ad', 4, 4, 24, 16); R('#c7ced6', 4, 4, 24, 3);
      for (let i = 0; i < 4; i++) R('#6d7680', 7, 9 + i * 3, 18, 1);
      break;
    case 'coffee':
      R('#3a3a42', 7, 4, 18, 22); R('#55555f', 7, 4, 18, 4);
      R(Math.floor(t / 600) % 2 ? '#ff5d5d' : '#a33', 20, 10, 3, 3);
      R('#f2efe8', 12, 18, 7, 6);
      break;
    case 'vending':
      R('#2c5aa0', 5, 2, 22, 27); R('#9cc6ff', 8, 5, 12, 16);
      for (let i = 0; i < 3; i++) R(['#ff7a59', '#93d36b', '#ffd166'][i], 9 + i * 4, 8, 2, 12);
      R('#1b2f55', 22, 8, 3, 10);
      break;
    case 'toilet':
      R('#e9eef2', 9, 3, 14, 7);
      ctx.fillStyle = '#f7fafc'; ctx.beginPath(); ctx.ellipse(X + 16, Y + 19, 8, 9, 0, 0, 7); ctx.fill();
      ctx.fillStyle = '#c8d6df'; ctx.beginPath(); ctx.ellipse(X + 16, Y + 19, 5, 6, 0, 0, 7); ctx.fill();
      break;
    case 'sofa':
      R('#6a4e94', 2, 6, 28, 20); R('#7f61ad', 5, 12, 22, 12); R('#5a3f82', 2, 6, 28, 5);
      break;
    case 'arcade':
      R('#1f1a2b', 6, 2, 20, 27);
      R(`hsl(${(t / 20) % 360},80%,60%)`, 9, 5, 14, 10);
      R('#ff5d6c', 10, 19, 4, 4); R('#ffd166', 17, 20, 3, 3);
      break;
    default:
      R('#888', 6, 6, 20, 20);
  }
  if (FURN[f.type].use && FURN[f.type].use !== 'work' && f.user !== null) R('rgba(255,179,71,.9)', 26, 1, 5, 5);
}

function drawEmployee(ctx: CanvasRenderingContext2D, e: Employee, t: number, sel: boolean) {
  const X = e.x * TILE, Y = e.y * TILE;
  const hue = SKILL_HUE[e.spec];
  const bob = e.state === 'walking' ? Math.sin(t / 90 + e.id) * 1.5 : 0;
  ctx.fillStyle = 'rgba(0,0,0,.22)';
  ctx.beginPath(); ctx.ellipse(X, Y + 9, 8, 3.5, 0, 0, 7); ctx.fill();
  if (sel) { ctx.strokeStyle = '#ffb347'; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(X, Y + 9, 11, 5, 0, 0, 7); ctx.stroke(); }
  ctx.fillStyle = `hsl(${hue},55%,52%)`;
  ctx.beginPath(); ctx.ellipse(X, Y + 2 + bob, 7, 8, 0, 0, 7); ctx.fill();
  ctx.fillStyle = '#e8bf98';
  ctx.beginPath(); ctx.arc(X, Y - 7 + bob, 5.5, 0, 7); ctx.fill();
  ctx.fillStyle = `hsl(${(e.id * 47) % 60 + 10},45%,${20 + (e.id % 3) * 10}%)`;
  ctx.beginPath(); ctx.arc(X, Y - 9 + bob, 5.5, Math.PI, 0); ctx.fill();

  const icon = e.missing ? '!' : e.state === 'working' && e.motivation < 30 ? '…' : '';
  if (icon) {
    ctx.fillStyle = e.missing ? '#ff5d6c' : '#ffd166';
    ctx.beginPath(); ctx.arc(X + 9, Y - 16, 6, 0, 7); ctx.fill();
    ctx.fillStyle = '#1a1420'; ctx.font = 'bold 10px system-ui'; ctx.textAlign = 'center';
    ctx.fillText(icon, X + 9, Y - 12.5); ctx.textAlign = 'start';
  }
}
