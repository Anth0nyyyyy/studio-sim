import { AUDIENCES, GENRE, GENRES, PHASES, PLATFORM, REVIEWERS, SIZES, TOPICS, VERDICTS } from '../core/data';
import type { Game, GameState, ProjectSpec, SizeId } from '../core/types';
import { esc, money } from '../core/util';
import { engineReady, maxPlatforms, sizeUnlocked } from '../sim/research';
import {
  COMBO_LABEL, audienceFit, availablePlatforms, importanceLabel, phaseTarget,
  projectCost, release, setSliders, startProject, validateSpec,
} from '../sim/project';

const $ = (id: string) => document.getElementById(id)!;
const modal = () => $('modal');
export const closeModal = () => { modal().innerHTML = ''; modal().onclick = null; modal().oninput = null; modal().onchange = null; };
const scoreColor = (v: number) => (v >= 8 ? '#93d36b' : v >= 6 ? '#ffb347' : v >= 4 ? '#e8a06b' : '#ff5d6c');
const COMBO_ICON: Record<string, string> = { '*': '★', '+': '+', '0': '=', '-': '−', x: '✕' };

const NAME_A = ['Dark', 'Super', 'Turbo', 'Pixel', 'Neo', 'Ultra', 'Royal', 'Cosmic', 'Iron', 'Lost'];
const NAME_B = ['Quest', 'Legends', 'Rush', 'Tactics', 'Saga', 'Odyssey', 'Heroes', 'Chronicles', 'Arena', 'Frontier'];
const randomName = () => `${NAME_A[Math.floor(Math.random() * 10)]} ${NAME_B[Math.floor(Math.random() * 10)]}`;

/* ---------- Carte du projet en cours ---------- */
let cardKey = '';
export function renderProjectCard(s: GameState, openSlidersFn: () => void) {
  const el = $('project');
  const p = s.project;
  if (!p) { el.hidden = true; cardKey = ''; return; }
  el.hidden = false;
  const key = `${p.name}|${p.phase}|${p.wait}`;
  if (key !== cardKey) {
    cardKey = key;
    const phaseName = p.phase <= 2 ? `Phase ${p.phase + 1}/3 · ${PHASES[p.phase].name}` : 'Polissage';
    el.innerHTML = `
      <div class="pt"><b>${esc(p.name)}</b><small>${esc(p.topic)} · ${p.genre}${p.sub ? '/' + p.sub : ''} · ${p.platforms.map(id => PLATFORM[id].name).join(', ')}</small></div>
      <div class="meta">${phaseName}${p.wait ? ' · en attente de vos priorités' : ''}</div>
      <div class="segs">${[0, 1, 2, 3].map(i => `<div><i id="pseg${i}"></i></div>`).join('')}</div>
      <div class="pnums">
        <span class="D">Design <b id="pv-d"></b></span><span class="T">Tech <b id="pv-t"></b></span>
        <span class="G">Graphismes <b id="pv-g"></b></span><span class="S">Son <b id="pv-s"></b></span>
        <span class="H">Hype <b id="pv-h"></b></span><span class="B">Bugs <b id="pv-b"></b></span>
      </div>
      <div class="row">
        ${p.wait ? '<button class="primary" id="pc-sl">Choisir les priorités</button>' : ''}
        ${p.phase === 3 ? '<button class="primary" id="pc-rel">Sortir le jeu</button><span class="meta">Les tests (QA) et les devs corrigent les bugs restants.</span>' : ''}
      </div>`;
    el.querySelector('#pc-sl')?.addEventListener('click', openSlidersFn);
    el.querySelector('#pc-rel')?.addEventListener('click', () => release(s));
  }
  for (let i = 0; i < 4; i++) {
    const v = i < p.phase ? 100 : i > p.phase ? 0 : i === 3 ? (p.bugs < 0.5 ? 100 : 50) : (p.progress / p.target) * 100;
    ($(`pseg${i}`) as HTMLElement).style.width = `${Math.min(100, v)}%`;
  }
  $('pv-d').textContent = String(Math.round(p.design));
  $('pv-t').textContent = String(Math.round(p.tech));
  $('pv-g').textContent = String(Math.round(p.graph));
  $('pv-s').textContent = String(Math.round(p.son));
  $('pv-h').textContent = String(Math.round(p.hype));
  $('pv-b').textContent = String(Math.ceil(p.bugs));
}

/* ---------- Assistant de création ---------- */
export function openWizard(s: GameState, onStart: () => void) {
  const plats = availablePlatforms(s);
  const ready = s.engines.filter(e => engineReady(s, e));
  const spec: ProjectSpec = { name: randomName(), topic: '', genre: '', sub: null, audience: 'all', size: 'S', platforms: [plats[0].id], engine: ready[ready.length - 1]?.id ?? 0 };

  const chip = (k: string, v: string, on: boolean, label: string, extra = '', disabled = false) =>
    `<button class="chip" data-k="${k}" data-v="${esc(v)}" aria-pressed="${on}" ${disabled ? 'disabled' : ''}>${label}${extra ? `<em>${extra}</em>` : ''}</button>`;

  const body = () => {
    const err = validateSpec(s, spec);
    const cost = projectCost(spec);
    const known = spec.topic && spec.genre ? s.combos[`${spec.topic}|${spec.genre}`] : undefined;
    const fit = spec.topic ? audienceFit(spec.topic, spec.audience) : '0';
    return `<div class="dialog" role="dialog" aria-modal="true" aria-labelledby="wz-t">
      <header><h3 id="wz-t">Nouveau jeu</h3><button data-close>Annuler</button></header>
      <label class="field"><span>Titre</span><input type="text" id="wz-name" maxlength="40" value="${esc(spec.name)}"></label>
      <div class="field"><span>Sujet</span><div class="chips">${TOPICS.filter(t => s.topics.includes(t.name)).map(t => chip('topic', t.name, spec.topic === t.name, t.name)).join('')}</div></div>
      <div class="field"><span>Genre</span><div class="chips">${GENRES.map(g => {
        const c = spec.topic ? s.combos[`${spec.topic}|${g.id}`] : undefined;
        return chip('genre', g.id, spec.genre === g.id, g.id, c ? COMBO_ICON[c] : '');
      }).join('')}</div>${known ? `<div class="hint">Déjà testé : ${COMBO_LABEL[known]}</div>` : ''}</div>
      <div class="field"><span>Sous-genre (facultatif)</span><div class="chips">${chip('sub', '', spec.sub === null, 'Aucun')}${GENRES.filter(g => g.id !== spec.genre).map(g => chip('sub', g.id, spec.sub === g.id, g.id)).join('')}</div></div>
      <div class="field"><span>Public</span><div class="chips">${AUDIENCES.map(a => chip('audience', a.id, spec.audience === a.id, a.name)).join('')}</div>
        ${spec.topic && fit === '-' ? `<div class="warn">Ce sujet colle mal à ce public.</div>` : ''}</div>
      <div class="field"><span>Taille</span><div class="chips">${(Object.keys(SIZES) as SizeId[]).map(k => {
        const z = SIZES[k];
        const unlocked = sizeUnlocked(s, k);
        return chip('size', k, spec.size === k, z.name, unlocked ? `${money(z.cost)} · ${z.minStaff}+ employés` : 'recherche requise', !unlocked || s.employees.length < z.minStaff);
      }).join('')}</div></div>
      <div class="field"><span>Moteur</span><div class="chips">${ready.map(e => chip('engine', String(e.id), spec.engine === e.id, esc(e.name), `tech ${e.tech.toFixed(1)}`)).join('')}</div></div>
      <div class="field"><span>Plateformes (jusqu’à ${maxPlatforms(s)})</span><div class="chips">${plats.map(p =>
        chip('plat', p.id, spec.platforms.includes(p.id), p.name, `marché ×${p.market}${p.license ? ' · licence ' + money(p.license) : ''}`)).join('')}</div></div>
      <div class="sum"><span>Coût : <b>${money(cost)}</b></span><span>Points par phase : ${Math.round(phaseTarget(s, spec))}</span><span>Trésorerie : ${money(s.money)}</span></div>
      ${err && spec.topic && spec.genre ? `<div class="warn">${err}</div>` : ''}
      <div class="row"><button class="primary" id="wz-go" ${err ? 'disabled' : ''}>Lancer le développement</button></div>
    </div>`;
  };
  const render = () => { modal().innerHTML = body(); };
  render();
  modal().onclick = ev => {
    const t = ev.target as HTMLElement;
    if (t === modal() || t.closest('[data-close]')) { closeModal(); return; }
    const c = t.closest<HTMLElement>('[data-k]');
    if (c) {
      spec.name = ($('wz-name') as HTMLInputElement).value;
      const k = c.dataset.k!, v = c.dataset.v!;
      if (k === 'topic') spec.topic = v;
      if (k === 'genre') { spec.genre = v; if (spec.sub === v) spec.sub = null; }
      if (k === 'sub') spec.sub = v || null;
      if (k === 'audience') spec.audience = v;
      if (k === 'size') spec.size = v as SizeId;
      if (k === 'engine') spec.engine = +v;
      if (k === 'plat') {
        if (spec.platforms.includes(v)) { if (spec.platforms.length > 1) spec.platforms = spec.platforms.filter(x => x !== v); }
        else if (spec.platforms.length < maxPlatforms(s)) spec.platforms = [...spec.platforms, v];
        else if (maxPlatforms(s) === 1) spec.platforms = [v];
      }
      render();
      return;
    }
    if (t.id === 'wz-go') {
      spec.name = ($('wz-name') as HTMLInputElement).value;
      closeModal();
      const err = startProject(s, spec);
      if (err) openWizard(s, onStart); else onStart();
    }
  };
}

/* ---------- Curseurs de phase ---------- */
export function openSliders(s: GameState, onDone: () => void) {
  const p = s.project;
  if (!p || p.phase > 2 || !p.wait) return;
  const ph = p.phase;
  const known = s.know[p.genre] ?? [];
  const lvl = (v: number) => (v < 34 ? 'Faible' : v < 67 ? 'Moyen' : 'Élevé');
  modal().innerHTML = `<div class="dialog" role="dialog" aria-modal="true" aria-labelledby="sl-t" style="max-width:520px">
    <header><h3 id="sl-t">${PHASES[ph].name} · phase ${ph + 1}/3</h3></header>
    <div class="meta" style="color:var(--mute)">${esc(p.name)} · ${esc(p.topic)} / ${p.genre}. Répartissez le travail de l’équipe de développement.</div>
    ${PHASES[ph].areas.map(([name, type], i) => {
      const k = known.includes(`${ph}-${i}`);
      return `<div class="sl"><div class="h"><label for="sl${i}">${name} <span class="tag ${type}">${type === 'D' ? 'Design' : 'Tech'}</span></label><span id="slv${i}">${lvl(p.sliders[ph][i])}</span></div>
        <input type="range" id="sl${i}" min="0" max="100" step="5" value="${p.sliders[ph][i]}">
        ${k ? `<span class="hint">${importanceLabel(GENRE[p.genre].w[ph][i])} pour ce genre</span>` : ''}</div>`;
    }).join('')}
    <div class="row"><button class="primary" id="sl-go">Continuer</button></div>
  </div>`;
  modal().oninput = ev => {
    const t = ev.target as HTMLInputElement;
    if (t.type === 'range') $(`slv${t.id.slice(2)}`).textContent = lvl(+t.value);
  };
  modal().onclick = ev => {
    if ((ev.target as HTMLElement).id !== 'sl-go') return;
    setSliders(s, [0, 1, 2].map(i => +($(`sl${i}`) as HTMLInputElement).value));
    closeModal();
    onDone();
  };
}

/* ---------- Critiques ---------- */
export function openReview(g: Game, notes: string[], insight: string) {
  const est = g.sched.reduce((a, b) => a + b, 0);
  modal().innerHTML = `<div class="dialog" role="dialog" aria-modal="true" aria-labelledby="rv-t" style="max-width:640px">
    <header><h3 id="rv-t">${esc(g.name)} : les critiques</h3></header>
    <div class="reviews">${g.reviews.map((r, i) => `<div><small>${REVIEWERS[i]}</small><b style="color:${scoreColor(r)}">${r}</b><small>${VERDICTS[r]}</small></div>`).join('')}</div>
    <div class="sum"><span>Moyenne <b>${g.score.toFixed(1)}/10</b></span><span>Ventes estimées ~${Math.round(est).toLocaleString('fr-FR')}</span><span>Recette ~${money(est * SIZES[g.size].price)}</span></div>
    ${notes.length || insight ? `<div class="notes">${notes.map(n => `<span>${n}</span>`).join('')}${insight ? `<span class="hint">Analyse : ${insight}</span>` : ''}</div>` : ''}
    <div class="row"><button class="primary" data-close>Continuer</button></div>
  </div>`;
  modal().onclick = ev => { if ((ev.target as HTMLElement).closest('[data-close]')) closeModal(); };
}

/* ---------- Catalogue ---------- */
export function openGames(s: GameState) {
  modal().innerHTML = `<div class="dialog" role="dialog" aria-modal="true" aria-labelledby="gm-t">
    <header><h3 id="gm-t">Vos jeux</h3><button data-close>Fermer</button></header>
    ${s.games.length ? `<div class="tablewrap"><table class="games"><thead><tr>
      <th>Jeu</th><th>Note</th><th>Sujet / genre</th><th>Plateformes</th><th>Ventes</th><th>Recette</th><th>Bénéfice</th><th>Statut</th></tr></thead><tbody>
      ${s.games.map(g => `<tr><td><b>${esc(g.name)}</b></td>
        <td><span class="score" style="background:${scoreColor(g.score)}">${g.score.toFixed(1)}</span></td>
        <td>${esc(g.topic)} / ${g.genre}${g.sub ? '/' + g.sub : ''}</td>
        <td>${g.platforms.map(id => PLATFORM[id].name).join(', ')}</td>
        <td>${g.units.toLocaleString('fr-FR')}</td><td>${money(g.revenue)}</td>
        <td style="color:${g.revenue - g.cost >= 0 ? 'var(--good)' : 'var(--bad)'}">${money(g.revenue - g.cost)}</td>
        <td>${g.si < g.sched.length ? `En vente (${g.sched.length - g.si} sem.)` : 'Retiré'}</td></tr>`).join('')}
      </tbody></table></div>` : '<div style="color:var(--mute)">Aucun jeu sorti pour l’instant. Lancez votre premier projet avec « Nouveau jeu ».</div>'}
  </div>`;
  modal().onclick = ev => {
    const t = ev.target as HTMLElement;
    if (t === modal() || t.closest('[data-close]')) closeModal();
  };
}
