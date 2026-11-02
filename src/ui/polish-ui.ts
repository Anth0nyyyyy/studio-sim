import type { GameState } from '../core/types';
import { esc } from '../core/util';
import { ACHIEVEMENTS } from '../sim/achievements';
import { END_YEAR, careerScore } from '../sim/endgame';
import { EVENT_BY_ID, resolveEvent } from '../sim/random-events';
import { closeModal } from './game-ui';
import { toast } from './ui';

const $ = (id: string) => document.getElementById(id)!;
const modal = () => $('modal');

/* ---------- Événement ---------- */
export function openEvent(s: GameState, onDone: () => void) {
  const p = s.pendingEvent;
  if (!p) return;
  const ev = EVENT_BY_ID[p.id];
  if (!ev) { s.pendingEvent = null; return; }
  const choices = ev.choices(s, p.target);
  modal().innerHTML = `<div class="dialog event" role="dialog" aria-modal="true" aria-labelledby="ev-t" style="max-width:520px">
    <header><h3 id="ev-t">${ev.title}</h3></header>
    <p class="evtext">${esc(ev.text(s, p.target))}</p>
    <div class="list">${choices.map((c, i) => `<button data-choice="${i}">${esc(c.label)}</button>`).join('')}</div>
  </div>`;
  modal().onclick = e => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-choice]');
    if (!b) return;
    const msg = resolveEvent(s, +b.dataset.choice!);
    closeModal();
    if (msg) toast(msg);
    onDone();
  };
}

/* ---------- Succès ---------- */
export function openAchievements(s: GameState) {
  modal().innerHTML = `<div class="dialog" role="dialog" aria-modal="true" aria-labelledby="ac-t" style="max-width:760px">
    <header><h3 id="ac-t">Succès</h3><span class="rp">${s.achievements.length}/${ACHIEVEMENTS.length}</span><button data-close>Fermer</button></header>
    <div class="awards">${ACHIEVEMENTS.map(a => {
      const ok = s.achievements.includes(a.id);
      return `<div class="aw ${ok ? 'mine' : 'locked'}"><b>${ok ? '★ ' : ''}${a.name}</b><small>${a.desc}</small></div>`;
    }).join('')}</div>
  </div>`;
  modal().onclick = e => {
    const t = e.target as HTMLElement;
    if (t === modal() || t.closest('[data-close]')) closeModal();
  };
}

/* ---------- Fin de partie ---------- */
export function openGameOver(s: GameState, reason: 'bankrupt' | 'ended', onNew: () => void, onContinue: () => void) {
  const sc = careerScore(s);
  const bankrupt = reason === 'bankrupt';
  modal().innerHTML = `<div class="dialog" role="dialog" aria-modal="true" aria-labelledby="go-t" style="max-width:560px">
    <header><h3 id="go-t">${bankrupt ? 'Faillite' : `Fin de carrière · ${END_YEAR}`}</h3></header>
    <p class="evtext">${bankrupt
      ? 'Trois mois dans le rouge : la banque a fermé le studio. Voici ce que vous laissez derrière vous.'
      : 'Trente-trois ans d’histoire du jeu vidéo sont passés. Voici le bilan de votre studio.'}</p>
    <div class="tablewrap"><table class="games"><tbody>
      ${sc.lines.map(([l, v, p]) => `<tr><td>${l}</td><td>${v}</td><td style="text-align:right">${p.toLocaleString('fr-FR')} pts</td></tr>`).join('')}
      <tr class="tot"><td><b>Score final</b></td><td></td><td style="text-align:right"><b>${sc.total.toLocaleString('fr-FR')} pts</b></td></tr>
    </tbody></table></div>
    <div class="row">
      ${bankrupt ? '' : '<button class="primary" data-go="continue">Continuer en mode libre</button>'}
      <button ${bankrupt ? 'class="primary"' : ''} data-go="new">Nouvelle partie</button>
    </div>
  </div>`;
  modal().onclick = e => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-go]');
    if (!b) return;
    closeModal();
    if (b.dataset.go === 'new') onNew(); else onContinue();
  };
}

/* ---------- Tutoriel ---------- */
interface Step { title: string; text: string; done: (s: GameState) => boolean }
const STEPS: Step[] = [
  { title: 'Votre premier jeu', text: 'Cliquez sur « Nouveau jeu », choisissez un sujet et un genre qui vont bien ensemble, puis lancez le développement.', done: s => !!s.project || s.games.length > 0 },
  { title: 'Les priorités', text: 'À chaque phase, répartissez l’effort entre trois domaines. Chaque genre a ses domaines clés : les critiques vous les révéleront peu à peu.', done: s => s.games.length > 0 || (!!s.project && s.project.phase >= 1) },
  { title: 'La sortie', text: 'Quand le contenu est terminé, laissez l’équipe corriger quelques bugs puis cliquez sur « Sortir le jeu ».', done: s => s.games.length > 0 },
  { title: 'Une salle de repos', text: 'Outil « Salles » → Salle de repos, glissez sur le terrain, puis « Meubles » → Canapé. Une équipe reposée produit davantage.', done: s => s.furniture.some(f => f.type === 'sofa') },
  { title: 'La recherche', text: 'Construisez une salle Recherche avec un poste de travail et affectez-y quelqu’un (cliquez sur l’employé). Les points de recherche débloquent de nouvelles possibilités.', done: s => s.rooms.some(r => r.type === 'rd') },
  { title: 'Un entrepôt', text: 'Vos ventes physiques sont limitées par le stock. Construisez un Entrepôt avec des étagères, puis gérez le stock dans « Jeux ».', done: s => s.furniture.some(f => f.type === 'shelf') },
  { title: 'Grandir', text: 'Recrutez, explorez le Marché, les Finances et la Recherche. Bonne chance jusqu’en 2013 !', done: s => s.employees.length >= 4 },
];

let tutoKey = '';
export function renderTutorial(s: GameState) {
  const el = $('tuto');
  while (s.tutorial >= 0 && s.tutorial < STEPS.length && STEPS[s.tutorial].done(s)) s.tutorial++;
  if (s.tutorial >= STEPS.length) s.tutorial = -1;
  if (s.tutorial < 0) { el.hidden = true; tutoKey = ''; return; }
  const key = String(s.tutorial);
  if (key === tutoKey && !el.hidden) return;
  tutoKey = key;
  const st = STEPS[s.tutorial];
  el.hidden = false;
  el.innerHTML = `<div class="rh"><b>${st.title}</b><small>${s.tutorial + 1}/${STEPS.length}</small></div><p>${st.text}</p><button data-skip>Passer le tutoriel</button>`;
  el.querySelector('[data-skip]')!.addEventListener('click', () => { s.tutorial = -1; el.hidden = true; });
}
