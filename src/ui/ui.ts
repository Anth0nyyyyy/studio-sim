import { FURN, FURN_LIST, OUTPUT_LABEL, ROOMS, ROOM_LIST, isWorkRoom } from '../core/data';
import { DAY_SEC, dateLabel } from '../core/time';
import { NEED_LABEL, SKILLS, SKILL_HUE, SKILL_LABEL, type Employee, type GameState } from '../core/types';
import { esc, money } from '../core/util';
import { demolishRoom, roomComfort, sellFurniture } from '../sim/build';
import { assignRoom, fire, hire, hireFee, roomSkill, stateLabel } from '../sim/employees';
import { monthlyCosts } from '../sim/tick';

export type Tool = 'select' | 'room' | 'furn' | 'door' | 'demolish';
export type Selection = { kind: 'emp' | 'room' | 'furn'; id: number } | null;

export interface UIState {
  tool: Tool;
  roomType: string;
  furnType: string;
  selected: Selection;
  speed: number;
}

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

export function toast(m: string, err = false) {
  const box = $('toasts');
  const d = document.createElement('div');
  d.textContent = m;
  if (err) d.className = 'err';
  box.prepend(d);
  setTimeout(() => d.remove(), 4000);
  while (box.children.length > 4) box.lastChild!.remove();
}

const bar = (label: string, v: number, color: string, suffix = '') =>
  `<div class="bar"><span>${label}</span><i><b style="width:${Math.max(0, Math.min(100, v))}%;background:${color}"></b></i><em>${Math.round(v)}${suffix}</em></div>`;
const needColor = (v: number) => (v > 80 ? 'var(--bad)' : v > 55 ? 'var(--accent)' : 'var(--good)');

export function renderTools(ui: UIState, s: GameState) {
  document.querySelectorAll<HTMLButtonElement>('#tools [data-tool]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.tool === ui.tool)));
  const p = $('palette');
  if (ui.tool === 'room') {
    p.innerHTML = ROOM_LIST.map(r => `<button data-room="${r.id}" aria-pressed="${ui.roomType === r.id}">
      <span><i class="sw" style="background:${r.color}"></i>${r.name}</span><small>${r.costTile} $/case · min ${r.min[0]}×${r.min[1]}</small></button>`).join('')
      + '<div class="help">Glissez sur le terrain pour tracer la salle. Une porte est placée automatiquement.</div>';
  } else if (ui.tool === 'furn') {
    p.innerHTML = FURN_LIST.map(f => `<button data-furn="${f.id}" aria-pressed="${ui.furnType === f.id}" ${s.money < f.cost ? 'disabled' : ''}>
      <span>${f.name}</span><small>${money(f.cost)} · ${f.rooms.includes('*') ? 'toutes salles' : f.rooms.map(r => ROOMS[r].name).join(', ')}</small></button>`).join('');
  } else if (ui.tool === 'door') {
    p.innerHTML = '<div class="help">Cliquez près d’un mur pour ajouter une porte (500 $) ou en retirer une.</div>';
  } else if (ui.tool === 'demolish') {
    p.innerHTML = '<div class="help">Cliquez un meuble pour le vendre (50 %) ou une salle pour la démolir (30 % + meubles).</div>';
  } else {
    p.innerHTML = '<div class="help">Cliquez un employé, un meuble ou une salle. Clic droit ou glisser pour déplacer la vue, molette pour zoomer.</div>';
  }
}

export function updateTopbar(s: GameState, ui: UIState) {
  $('h-date').textContent = dateLabel(s.time);
  const m = $('h-money');
  m.textContent = money(s.money);
  m.style.color = s.money < 0 ? 'var(--bad)' : '';
  $('h-staff').textContent = String(s.employees.length);
  $('h-fans').textContent = Math.floor(s.fans).toLocaleString('fr-FR');
  $('h-rp').textContent = `${Math.floor(s.rp)} RP`;
  $('h-trend').textContent = `${s.market.trend.genre} · ${s.market.trend.topic}`;
  ($('b-game') as HTMLButtonElement).disabled = !!s.project;
  $('h-out').innerHTML = Object.entries(OUTPUT_LABEL)
    .filter(([k]) => (s.output[k] ?? 0) > 0)
    .map(([k, l]) => `<span title="Points produits">${l} ${Math.floor(s.output[k])}</span>`).join('');
  document.querySelectorAll<HTMLButtonElement>('#speed button').forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.sp! === ui.speed)));
}

function empPanel(s: GameState, e: Employee) {
  const workRooms = s.rooms.filter(r => isWorkRoom(r.type));
  const opts = [`<option value="">Aucune</option>`, ...workRooms.map(r =>
    `<option value="${r.id}" ${e.room === r.id ? 'selected' : ''}>${ROOMS[r.type].name} #${r.id} · efficacité ${Math.round(roomSkill(e, r.type))}</option>`)].join('');
  return `<h2>${esc(e.name)}</h2>
    <div class="sub">${SKILL_LABEL[e.spec]} · ${money(e.salary)}/mois · ${stateLabel(s, e)}${e.missing ? ` · <span style="color:var(--bad)">${NEED_LABEL[e.missing]} : rien à disposition</span>` : ''}</div>
    <div class="bars">
      ${bar('Motivation', e.motivation, e.motivation < 35 ? 'var(--bad)' : 'var(--good)')}
      ${bar('Fatigue', e.fatigue, needColor(e.fatigue))}
      ${bar('Faim', e.hunger, needColor(e.hunger))}
      ${bar('Toilettes', e.bladder, needColor(e.bladder))}
    </div>
    <div class="bars">${SKILLS.map(k => bar(SKILL_LABEL[k], e.skills[k], `hsl(${SKILL_HUE[k]},55%,58%)`)).join('')}</div>
    <div><label class="sub" for="sel-room">Affectation</label><select id="sel-room">${opts}</select></div>
    ${e.state === 'working' ? `<div class="sub">Production : ${(e.rate * DAY_SEC).toFixed(1)} pts/jour</div>` : ''}
    <div class="row"><button class="danger" data-act="fire">Licencier</button></div>`;
}

function roomPanel(s: GameState, id: number) {
  const r = s.rooms.find(o => o.id === id);
  if (!r) return '';
  const def = ROOMS[r.type];
  const desks = s.furniture.filter(f => f.room === r.id && FURN[f.type].use === 'work');
  const staff = s.employees.filter(e => e.room === r.id);
  const rate = staff.reduce((a, e) => a + e.rate, 0) * DAY_SEC;
  return `<h2>${def.name}</h2>
    <div class="sub">${r.w}×${r.h} cases · confort ${Math.round(roomComfort(s, r))}/40</div>
    <div class="kv">
      ${def.skills ? `<span>Postes occupés</span><span>${desks.filter(d => d.owner !== null).length}/${desks.length}</span>
      <span>Production</span><span>${rate.toFixed(1)} pts/jour</span>
      <span>Compétence</span><span>${def.skills.map(k => SKILL_LABEL[k]).join(' + ')}</span>` : ''}
      <span>Meubles</span><span>${s.furniture.filter(f => f.room === r.id).length}</span>
    </div>
    ${staff.length ? `<div class="list">${staff.map(e => `<button data-emp="${e.id}"><span>${esc(e.name)}</span><small>${stateLabel(s, e)}</small></button>`).join('')}</div>` : ''}
    <div class="row"><button class="danger" data-act="demolish">Démolir</button></div>`;
}

function furnPanel(s: GameState, id: number) {
  const f = s.furniture.find(o => o.id === id);
  if (!f) return '';
  const def = FURN[f.type];
  const owner = s.employees.find(e => e.id === f.owner);
  const user = s.employees.find(e => e.id === f.user);
  return `<h2>${def.name}</h2>
    <div class="sub">${ROOMS[s.rooms.find(r => r.id === f.room)!.type].name}</div>
    <div class="kv">
      ${def.use === 'work' ? `<span>Attribué à</span><span>${owner ? esc(owner.name) : 'Libre'}</span>` : ''}
      ${def.use && def.use !== 'work' ? `<span>Soulage</span><span>${NEED_LABEL[def.use]}</span><span>Utilisé par</span><span>${user ? esc(user.name) : 'Personne'}</span>` : ''}
      ${def.comfort ? `<span>Confort</span><span>+${def.comfort}</span>` : ''}
      ${def.boost ? `<span>Productivité</span><span>+${def.boost * 100} %</span>` : ''}
    </div>
    <div class="row"><button class="danger" data-act="sell">Vendre (${money(def.cost / 2)})</button></div>`;
}

function overviewPanel(s: GameState) {
  const unassigned = s.employees.filter(e => e.room === null || e.desk === null);
  const missing = s.employees.filter(e => e.missing);
  const rows = Object.entries(OUTPUT_LABEL).map(([k, l]) => `<span>${l}</span><span>${Math.floor(s.output[k] ?? 0)}</span>`).join('');
  return `<h2>Studio</h2>
    <div class="kv">
      <span>Employés</span><span>${s.employees.length}</span>
      <span>Charges mensuelles</span><span>${money(monthlyCosts(s))}</span>
      <span>Salles</span><span>${s.rooms.length}</span>
    </div>
    ${unassigned.length ? `<div class="sub" style="color:var(--accent)">${unassigned.length} employé(s) sans poste : construisez une salle et ajoutez des postes de travail.</div>` : ''}
    ${missing.length ? `<div class="sub" style="color:var(--bad)">${missing.length} employé(s) ne trouvent pas de quoi se reposer, manger ou aller aux toilettes.</div>` : ''}
    <div class="sub">Production cumulée</div><div class="kv">${rows}</div>
    <div class="list">${s.employees.map(e => `<button data-emp="${e.id}"><span>${esc(e.name)}</span><small>${SKILL_LABEL[e.spec]}</small></button>`).join('')}</div>`;
}

let lastKey = '';
export function renderPanel(s: GameState, ui: UIState, force = false) {
  const p = $('panel');
  if (!force && p.contains(document.activeElement) && document.activeElement?.tagName === 'SELECT') return;
  const sel = ui.selected;
  let html: string;
  if (sel?.kind === 'emp') {
    const e = s.employees.find(o => o.id === sel.id);
    html = e ? empPanel(s, e) : overviewPanel(s);
  } else if (sel?.kind === 'room') html = roomPanel(s, sel.id) || overviewPanel(s);
  else if (sel?.kind === 'furn') html = furnPanel(s, sel.id) || overviewPanel(s);
  else html = overviewPanel(s);
  const key = html;
  if (key === lastKey && !force) return;
  lastKey = key;
  const top = p.scrollTop;
  p.innerHTML = html;
  p.scrollTop = top;
}

export function bindPanel(s: () => GameState, ui: UIState, refresh: () => void) {
  const p = $('panel');
  p.addEventListener('click', ev => {
    const t = ev.target as HTMLElement;
    const empBtn = t.closest<HTMLElement>('[data-emp]');
    if (empBtn) { ui.selected = { kind: 'emp', id: +empBtn.dataset.emp! }; refresh(); return; }
    const act = t.closest<HTMLElement>('[data-act]')?.dataset.act;
    const st = s(), sel = ui.selected;
    if (!act || !sel) return;
    if (act === 'fire' && sel.kind === 'emp') { fire(st, sel.id); ui.selected = null; }
    if (act === 'demolish' && sel.kind === 'room') { demolishRoom(st, sel.id); ui.selected = null; }
    if (act === 'sell' && sel.kind === 'furn') { sellFurniture(st, sel.id); ui.selected = null; }
    refresh();
  });
  p.addEventListener('change', ev => {
    const t = ev.target as HTMLSelectElement;
    const sel = ui.selected;
    if (t.id !== 'sel-room' || sel?.kind !== 'emp') return;
    const st = s();
    const e = st.employees.find(o => o.id === sel.id);
    if (!e) return;
    assignRoom(st, e, t.value ? +t.value : null);
    if (t.value && e.desk === null) toast('Pas de poste libre dans cette salle : ajoutez un poste de travail.', true);
    t.blur();
    refresh();
  });
}

export function openHire(s: GameState, onChange: () => void) {
  const m = $('modal');
  const render = () => {
    m.innerHTML = `<div class="dialog" role="dialog" aria-modal="true" aria-labelledby="hire-t">
      <header><h3 id="hire-t">Candidats</h3><button data-close>Fermer</button></header>
      <div class="sub" style="color:var(--mute)">Prime d’embauche : la moitié du salaire mensuel. De nouveaux profils arrivent chaque semaine.</div>
      <div class="cands">${s.candidates.map(c => `<div class="cand">
        <div class="top"><b>${esc(c.name)}</b><span>${money(c.salary)}/mois</span></div>
        <div class="sub" style="color:var(--mute)">${SKILL_LABEL[c.spec]}</div>
        <div class="bars">${SKILLS.map(k => bar(SKILL_LABEL[k], c.skills[k], `hsl(${SKILL_HUE[k]},55%,58%)`)).join('')}</div>
        <button class="primary" data-hire="${c.id}" ${s.money < hireFee(c) ? 'disabled' : ''}>Embaucher (${money(hireFee(c))})</button>
      </div>`).join('') || '<div>Aucun candidat cette semaine.</div>'}</div></div>`;
  };
  render();
  m.onclick = ev => {
    const t = ev.target as HTMLElement;
    if (t === m || t.closest('[data-close]')) { m.innerHTML = ''; m.onclick = null; return; }
    const h = t.closest<HTMLElement>('[data-hire]');
    if (h) {
      hire(s, +h.dataset.hire!);
      const e = s.employees[s.employees.length - 1];
      if (e.desk === null) toast(`${e.name} n’a pas de poste libre : ajoutez un poste de travail.`, true);
      render(); onChange();
    }
  };
}
