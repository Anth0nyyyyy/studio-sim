import { FURN, ROOMS } from './core/data';
import { onLog } from './core/log';
import { loadLocal, newGame, parseSave, saveLocal } from './core/state';
import { weekIndex } from './core/time';
import type { GameState } from './core/types';
import { money } from './core/util';
import { TILE, draw, screenToWorld, type Camera, type Overlay } from './render/renderer';
import { edgeFromPointer, normRect, placeFurniture, toggleDoor, validateFurniture, validateRoom, createRoom, demolishRoom, sellFurniture } from './sim/build';
import { furnAt, roomAt } from './sim/grid';
import { tick } from './sim/tick';
import { bindPanel, openHire, renderPanel, renderTools, toast, updateTopbar, type Tool, type UIState } from './ui/ui';
import { on } from './core/events';
import { openGames, openReview, openSliders, openWizard, renderProjectCard } from './ui/game-ui';
import { openEngines, openResearch } from './ui/research-ui';
import { openAwards, openExpo, openMarket } from './ui/market-ui';
import { openFinance } from './ui/finance-ui';
import { openConsoles } from './ui/hardware-ui';

let s: GameState = loadLocal() ?? newGame();
const ui: UIState = { tool: 'select', roomType: 'dev', furnType: 'desk', selected: null, speed: 1 };

const canvas = document.getElementById('view') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
let vw = 0, vh = 0, dpr = 1;
const cam: Camera = { x: 0, y: 0, zoom: 1 };
const ov: Overlay = { hover: null, rect: null, tileHint: null, edge: null, selected: null };

function resize() {
  dpr = Math.min(2, window.devicePixelRatio || 1);
  vw = window.innerWidth; vh = window.innerHeight;
  canvas.width = Math.round(vw * dpr); canvas.height = Math.round(vh * dpr);
}
function centerCamera() {
  const fit = Math.min(vw / ((s.lot.x1 - s.lot.x0 + 4) * TILE), (vh - 80) / ((s.lot.y1 - s.lot.y0 + 4) * TILE));
  cam.zoom = Math.max(0.5, Math.min(1.4, fit * 1.6));
  const [ex, ey] = s.entrance;
  cam.x = (ex + 0.5) * TILE - vw / 2 / cam.zoom;
  cam.y = (ey - 5) * TILE - vh / 2 / cam.zoom;
}
resize(); centerCamera();
window.addEventListener('resize', resize);

onLog(m => toast(m));
const refresh = () => { renderPanel(s, ui, true); renderTools(ui, s); updateTopbar(s, ui); };
bindPanel(() => s, ui, refresh);

/* ---------- Outils ---------- */
function setTool(t: Tool) {
  ui.tool = t; ov.rect = null; ov.tileHint = null; ov.edge = null;
  renderTools(ui, s);
}
document.getElementById('tools')!.addEventListener('click', ev => {
  const b = (ev.target as HTMLElement).closest<HTMLElement>('button');
  if (!b) return;
  if (b.dataset.tool) setTool(b.dataset.tool as Tool);
  if (b.dataset.room) { ui.roomType = b.dataset.room; renderTools(ui, s); }
  if (b.dataset.furn) { ui.furnType = b.dataset.furn; renderTools(ui, s); }
});
document.getElementById('speed')!.addEventListener('click', ev => {
  const b = (ev.target as HTMLElement).closest<HTMLElement>('[data-sp]');
  if (b) { ui.speed = +b.dataset.sp!; updateTopbar(s, ui); }
});
document.getElementById('b-hire')!.onclick = () => openHire(s, refresh);
const showSliders = () => openSliders(s, refresh);
document.getElementById('b-game')!.onclick = () => {
  if (s.project) { toast('Un jeu est déjà en développement.', true); return; }
  openWizard(s, refresh);
};
document.getElementById('b-games')!.onclick = () => openGames(s);
document.getElementById('b-market')!.onclick = () => openMarket(s);
document.getElementById('b-finance')!.onclick = () => openFinance(s, refresh);
document.getElementById('b-consoles')!.onclick = () => openConsoles(s, refresh);
on('expo', ({ year }) => { refresh(); openExpo(s, year, refresh); });
on('awards', ({ year, results, won }) => { refresh(); openAwards(year, results, won); saveLocal(s); });
document.getElementById('b-research')!.onclick = () => openResearch(s, refresh);
document.getElementById('b-engines')!.onclick = () => openEngines(s, refresh);
on('sliders', () => { refresh(); showSliders(); });
on('released', ({ game, notes, insight }) => { refresh(); openReview(game, notes, insight); saveLocal(s); });
document.getElementById('b-save')!.onclick = () => {
  const ok = saveLocal(s);
  toast(ok ? 'Partie sauvegardée.' : 'Sauvegarde impossible dans ce navigateur.', !ok);
};
document.getElementById('b-export')!.onclick = () => {
  const blob = new Blob([JSON.stringify(s)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `studio-sim-${weekIndex(s.time)}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
};
(document.getElementById('f-import') as HTMLInputElement).onchange = async ev => {
  const f = (ev.target as HTMLInputElement).files?.[0];
  if (!f) return;
  const loaded = parseSave(await f.text());
  if (!loaded) { toast('Fichier de sauvegarde invalide.', true); return; }
  s = loaded; ui.selected = null; centerCamera(); refresh(); toast('Partie importée.');
};
let confirmNew = 0;
document.getElementById('b-new')!.onclick = ev => {
  const b = ev.currentTarget as HTMLButtonElement;
  if (Date.now() - confirmNew > 3000) { confirmNew = Date.now(); b.textContent = 'Confirmer ?'; setTimeout(() => (b.textContent = 'Nouvelle partie'), 3000); return; }
  s = newGame(); ui.selected = null; centerCamera(); refresh(); b.textContent = 'Nouvelle partie';
};

/* ---------- Souris / tactile ---------- */
type Drag = { mode: 'pan' | 'rect' | 'click'; sx: number; sy: number; cx: number; cy: number; tx: number; ty: number; moved: boolean; button: number };
let drag: Drag | null = null;

function tileAt(px: number, py: number): [number, number, number, number] {
  const [wx, wy] = screenToWorld(cam, px, py);
  const tx = Math.floor(wx / TILE), ty = Math.floor(wy / TILE);
  return [tx, ty, wx / TILE - tx, wy / TILE - ty];
}

function updateHints(px: number, py: number) {
  const [tx, ty, fx, fy] = tileAt(px, py);
  ov.hover = roomAt(s, tx, ty) >= -1 && tx >= 0 && ty >= 0 && tx < s.W && ty < s.H ? [tx, ty] : null;
  ov.tileHint = null; ov.edge = null;
  if (ui.tool === 'room' && drag?.mode === 'rect') {
    const r = normRect(drag.tx, drag.ty, tx, ty);
    const v = validateRoom(s, ui.roomType, r.x, r.y, r.w, r.h);
    ov.rect = { ...r, ok: v.ok, label: `${ROOMS[ui.roomType].name} ${r.w}×${r.h} · ${money(v.cost)}${v.ok ? '' : ' · ' + v.reason}` };
  } else ov.rect = null;
  if (ui.tool === 'furn' && ov.hover) {
    const v = validateFurniture(s, ui.furnType, tx, ty);
    ov.tileHint = { x: tx, y: ty, ok: v.ok, label: `${FURN[ui.furnType].name} · ${v.ok ? money(v.cost) : v.reason}` };
  }
  if (ui.tool === 'door' && ov.hover) {
    const e = edgeFromPointer(tx, ty, fx, fy);
    if (roomAt(s, e[0], e[1]) !== roomAt(s, e[2], e[3])) ov.edge = e;
  }
}

function pickAt(px: number, py: number) {
  const [wx, wy] = screenToWorld(cam, px, py);
  const ex = wx / TILE, ey = wy / TILE;
  const emp = s.employees.find(e => Math.hypot(e.x - ex, e.y - 0.15 - ey) < 0.45);
  if (emp) return { kind: 'emp' as const, id: emp.id };
  const tx = Math.floor(ex), ty = Math.floor(ey);
  const f = furnAt(s, tx, ty);
  if (f) return { kind: 'furn' as const, id: f };
  const r = roomAt(s, tx, ty);
  if (r > 0) return { kind: 'room' as const, id: r };
  return null;
}

function clickAction(px: number, py: number) {
  const [tx, ty, fx, fy] = tileAt(px, py);
  switch (ui.tool) {
    case 'select':
      ui.selected = pickAt(px, py);
      break;
    case 'furn': {
      const r = placeFurniture(s, ui.furnType, tx, ty);
      if (!r.ok) toast(r.reason, true);
      break;
    }
    case 'door': {
      const r = toggleDoor(s, ...edgeFromPointer(tx, ty, fx, fy));
      if (!r.ok) toast(r.reason, true); else if (r.cost) toast('Porte ajoutée.');
      break;
    }
    case 'demolish': {
      const f = furnAt(s, tx, ty);
      if (f) { sellFurniture(s, f); toast('Meuble vendu.'); }
      else if (roomAt(s, tx, ty) > 0) demolishRoom(s, roomAt(s, tx, ty));
      if (ui.selected) ui.selected = null;
      break;
    }
  }
  refresh();
}

canvas.addEventListener('contextmenu', e => e.preventDefault());
canvas.addEventListener('pointerdown', e => {
  canvas.setPointerCapture(e.pointerId);
  const [tx, ty] = tileAt(e.offsetX, e.offsetY);
  const mode = e.button !== 0 ? 'pan' : ui.tool === 'room' ? 'rect' : 'click';
  drag = { mode, sx: e.offsetX, sy: e.offsetY, cx: cam.x, cy: cam.y, tx, ty, moved: false, button: e.button };
  updateHints(e.offsetX, e.offsetY);
});
canvas.addEventListener('pointermove', e => {
  if (drag) {
    const dx = e.offsetX - drag.sx, dy = e.offsetY - drag.sy;
    if (Math.hypot(dx, dy) > 5) drag.moved = true;
    if (drag.mode === 'click' && drag.moved && ui.tool === 'select') drag.mode = 'pan';
    if (drag.mode === 'pan') { cam.x = drag.cx - dx / cam.zoom; cam.y = drag.cy - dy / cam.zoom; }
  }
  updateHints(e.offsetX, e.offsetY);
});
canvas.addEventListener('pointerup', e => {
  if (!drag) return;
  const d = drag; drag = null;
  if (d.mode === 'rect') {
    const [tx, ty] = tileAt(e.offsetX, e.offsetY);
    const r = normRect(d.tx, d.ty, tx, ty);
    const res = createRoom(s, ui.roomType, r.x, r.y, r.w, r.h);
    if (!res.ok) toast(res.reason, true);
    ov.rect = null; refresh();
  } else if (d.mode === 'click' && !d.moved) clickAction(e.offsetX, e.offsetY);
  updateHints(e.offsetX, e.offsetY);
});
canvas.addEventListener('pointerleave', () => { if (!drag) { ov.hover = null; ov.tileHint = null; ov.edge = null; } });
canvas.addEventListener('wheel', e => {
  e.preventDefault();
  const [wx, wy] = screenToWorld(cam, e.offsetX, e.offsetY);
  cam.zoom = Math.max(0.4, Math.min(2.5, cam.zoom * Math.exp(-e.deltaY * 0.0015)));
  cam.x = wx - e.offsetX / cam.zoom; cam.y = wy - e.offsetY / cam.zoom;
}, { passive: false });

const keys = new Set<string>();
window.addEventListener('keydown', e => {
  if ((e.target as HTMLElement).tagName === 'SELECT' || (e.target as HTMLElement).tagName === 'INPUT') return;
  if (document.getElementById('modal')!.innerHTML) { if (e.key === 'Escape') document.getElementById('modal')!.innerHTML = ''; return; }
  keys.add(e.key.toLowerCase());
  if (e.code === 'Space') { e.preventDefault(); ui.speed = ui.speed ? 0 : 1; }
  if (e.key === '1') ui.speed = 1;
  if (e.key === '2') ui.speed = 2;
  if (e.key === '3') ui.speed = 4;
  if (e.key === 'Escape') { setTool('select'); ui.selected = null; refresh(); }
  const map: Record<string, Tool> = { r: 'room', f: 'furn', d: 'door', x: 'demolish' };
  if (map[e.key.toLowerCase()]) setTool(map[e.key.toLowerCase()]);
  updateTopbar(s, ui);
});
window.addEventListener('keyup', e => keys.delete(e.key.toLowerCase()));

/* ---------- Boucle ---------- */
let last = performance.now(), uiTimer = 0, saveWeek = weekIndex(s.time);
function frame(now: number) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;

  const pan = 600 * dt / cam.zoom;
  if (keys.has('arrowleft') || keys.has('q')) cam.x -= pan;
  if (keys.has('arrowright')) cam.x += pan;
  if (keys.has('arrowup') || keys.has('z') || keys.has('w')) cam.y -= pan;
  if (keys.has('arrowdown') || keys.has('s')) cam.y += pan;

  if (ui.speed > 0 && !document.getElementById('modal')!.innerHTML) {
    let rem = dt * ui.speed;
    while (rem > 0) { const step = Math.min(0.1, rem); tick(s, step); rem -= step; }
  }
  if (weekIndex(s.time) > saveWeek) { saveWeek = weekIndex(s.time); saveLocal(s); }

  ov.selected = ui.selected;
  draw(ctx, s, cam, vw, vh, dpr, ov, now);

  uiTimer += dt;
  if (uiTimer > 0.25) { uiTimer = 0; updateTopbar(s, ui); renderPanel(s, ui); renderProjectCard(s, showSliders); }
  requestAnimationFrame(frame);
}
refresh();
if (s.project?.wait) showSliders();
requestAnimationFrame(frame);
