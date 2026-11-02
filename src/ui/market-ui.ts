import { AWARDS, EXPO, RIVAL } from '../core/data';
import { weekIndex } from '../core/time';
import type { AwardResult, GameState } from '../core/types';
import { esc, money } from '../core/util';
import { activeRivals, bookStand, standCost, studioName } from '../sim/market';
import { closeModal } from './game-ui';
import { platformName } from '../sim/hardware';
import { NET, myStudio } from '../core/net-state';
import { toast } from './ui';

const $ = (id: string) => document.getElementById(id)!;
const modal = () => $('modal');
const scoreColor = (v: number) => (v >= 8 ? '#93d36b' : v >= 6 ? '#ffb347' : v >= 4 ? '#e8a06b' : '#ff5d6c');
const studioColor = (id: string) => (id === 'player' || id === myStudio() ? 'var(--accent)' : NET.names[id]?.color ?? RIVAL[id]?.color ?? '#999');

type Tab = 'chart' | 'rivals' | 'trends' | 'awards';

export function openMarket(s: GameState, start: Tab = 'chart') {
  let tab: Tab = start;

  const chart = () => s.market.chart.length ? `<div class="tablewrap"><table class="games"><thead><tr>
      <th>#</th><th></th><th>Jeu</th><th>Studio</th><th>Note</th><th>Ventes semaine</th></tr></thead><tbody>
      ${s.market.chart.map((e, i) => {
        const move = e.prev === null ? '<span class="mv new">nouveau</span>'
          : e.prev > i + 1 ? `<span class="mv up">▲ ${e.prev - i - 1}</span>`
          : e.prev < i + 1 ? `<span class="mv down">▼ ${i + 1 - e.prev}</span>` : '<span class="mv">=</span>';
        return `<tr class="${e.kind === 'player' ? 'mine' : ''}"><td><b>${i + 1}</b></td><td>${move}</td><td><b>${esc(e.name)}</b></td>
          <td><i class="dot" style="background:${studioColor(e.studio)}"></i>${esc(studioName(e.studio))}</td>
          <td><span class="score" style="background:${scoreColor(e.score)}">${e.score.toFixed(1)}</span></td>
          <td>${e.weekly.toLocaleString('fr-FR')}</td></tr>`;
      }).join('')}</tbody></table></div>`
    : '<div class="empty">Aucune vente cette semaine.</div>';

  const rivals = () => {
    const act = new Set(activeRivals(s).map(r => r.id));
    const rows = Object.values(RIVAL).filter(r => act.has(r.id) || s.market.games.some(g => g.studio === r.id)).map(r => {
      const games = s.market.games.filter(g => g.studio === r.id);
      const last = games[games.length - 1];
      const avg = games.length ? games.reduce((a, g) => a + g.score, 0) / games.length : 0;
      return `<div class="ecard">
        <div class="rh"><b><i class="dot" style="background:${r.color}"></i>${r.name}</b><small>${act.has(r.id) ? 'En activité' : 'Fermé'}</small></div>
        <div class="efeat"><span><em>Spécialités</em>${r.genres.join(', ')}</span><span><em>Jeux récents</em>${games.length}</span>${games.length ? `<span><em>Note moyenne</em>${avg.toFixed(1)}</span>` : ''}</div>
        ${last ? `<small>Dernier jeu : ${esc(last.name)} (${last.genre}, ${platformName(s, last.platform)}) · ${last.score.toFixed(1)}/10 · ${last.units.toLocaleString('fr-FR')} ventes</small>` : ''}
      </div>`;
    });
    return `<div class="elist">${rows.join('')}</div>`;
  };

  const trends = () => {
    const t = s.market.trend;
    const weeks = Math.max(0, t.until - weekIndex(s.time));
    const fans = Object.entries(s.fansGenre).sort((a, b) => b[1] - a[1]);
    const max = fans[0]?.[1] ?? 1;
    return `<div class="sum"><span>Genre à la mode : <b>${t.genre}</b> (ventes ×1,3)</span><span>Thème à la mode : <b>${t.topic}</b> (ventes ×1,2)</span><span>Encore ~${weeks} semaines</span></div>
      <div class="sub" style="color:var(--mute)">Chaque jeu concurrent du même genre sorti ces 4 dernières semaines réduit vos ventes : évitez les périodes encombrées.</div>
      <h4 class="h4">Vos fans par genre</h4>
      ${fans.length ? `<div class="bars">${fans.map(([g, n]) => `<div class="bar"><span>${g}</span><i><b style="width:${(n / max) * 100}%;background:var(--accent)"></b></i><em>${Math.round(n).toLocaleString('fr-FR')}</em></div>`).join('')}</div>`
        : '<div class="empty">Vos fans apparaîtront après vos premières ventes.</div>'}`;
  };

  const awards = () => s.market.awards.length ? `<div class="tablewrap"><table class="games"><thead><tr><th>Année</th><th>Trophée</th><th>Lauréat</th><th>Studio</th></tr></thead><tbody>
    ${s.market.awards.map(a => `<tr class="${a.player ? 'mine' : ''}"><td>${a.year}</td><td>${a.title}</td><td><b>${esc(a.winner)}</b></td><td>${esc(studioName(a.studio))}</td></tr>`).join('')}
    </tbody></table></div>` : `<div class="empty">Les ${AWARDS.name} sont remis à la fin de chaque année.</div>`;

  const render = () => {
    const tabs: [Tab, string][] = [['chart', 'Classement'], ['rivals', 'Concurrents'], ['trends', 'Tendances'], ['awards', 'Palmarès']];
    modal().innerHTML = `<div class="dialog" role="dialog" aria-modal="true" aria-labelledby="mk-t" style="max-width:860px">
      <header><h3 id="mk-t">Marché</h3><button data-close>Fermer</button></header>
      <div class="mtabs" role="tablist">${tabs.map(([id, l]) => `<button role="tab" data-tab="${id}" aria-selected="${tab === id}">${l}</button>`).join('')}</div>
      ${tab === 'chart' ? chart() : tab === 'rivals' ? rivals() : tab === 'trends' ? trends() : awards()}
    </div>`;
  };
  render();
  modal().onclick = ev => {
    const t = ev.target as HTMLElement;
    if (t === modal() || t.closest('[data-close]')) { closeModal(); return; }
    const b = t.closest<HTMLElement>('[data-tab]');
    if (b) { tab = b.dataset.tab as Tab; render(); }
  };
}

export function openExpo(s: GameState, y: number, onChange: () => void) {
  modal().innerHTML = `<div class="dialog" role="dialog" aria-modal="true" aria-labelledby="ex-t" style="max-width:560px">
    <header><h3 id="ex-t">${EXPO.name} ${y}</h3></header>
    <div class="sub" style="color:var(--mute)">${s.project
      ? `Présentez <b>${esc(s.project.name)}</b> au public : la hype gonflera ses ventes à la sortie.`
      : 'Aucun jeu en développement : un stand vous apportera seulement des fans.'}</div>
    <div class="list">${EXPO.stands.map(st => {
      const c = standCost(s, st.id);
      return `<button data-stand="${st.id}" ${c > s.money ? 'disabled' : ''}><span>${st.name}</span><small>${c ? `${money(c)} · +${st.hype} hype` : 'Gratuit'}</small></button>`;
    }).join('')}</div>
  </div>`;
  modal().onclick = ev => {
    const b = (ev.target as HTMLElement).closest<HTMLElement>('[data-stand]');
    if (!b) return;
    const err = bookStand(s, b.dataset.stand!);
    if (err) { toast(err, true); return; }
    closeModal(); onChange();
  };
}

export function openAwards(y: number, results: AwardResult[], won: number) {
  modal().innerHTML = `<div class="dialog" role="dialog" aria-modal="true" aria-labelledby="aw-t" style="max-width:600px">
    <header><h3 id="aw-t">${AWARDS.name} ${y}</h3></header>
    ${won ? `<div class="sum" style="color:var(--accent)"><b>${won} trophée(s) pour votre studio !</b></div>` : ''}
    ${results.length ? `<div class="list awards">${results.map(r => `<div class="aw ${r.player ? 'mine' : ''}"><small>${r.title}</small><b>${esc(r.winner)}</b><small>${esc(studioName(r.studio))}</small></div>`).join('')}</div>`
      : '<div class="empty">Aucun jeu sorti cette année.</div>'}
    <div class="row"><button class="primary" data-close>Continuer</button></div>
  </div>`;
  modal().onclick = ev => { if ((ev.target as HTMLElement).closest('[data-close]')) closeModal(); };
}

export const trendLabel = (s: GameState) => `${s.market.trend.genre} · ${s.market.trend.topic}`;
