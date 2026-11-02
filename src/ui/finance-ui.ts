import { BUSINESS, RIVAL } from '../core/data';
import { DAY_SEC, START_YEAR } from '../core/time';
import type { GameState } from '../core/types';
import { esc, money } from '../core/util';
import {
  MAX_CONTRACTS, acceptContract, acceptPublish, annuity, buyShares, creditLimit, debt, owned, repayLoan,
  rivalValue, sellShares, sharePrice, takeLoan,
} from '../sim/business';
import { activeRivals } from '../sim/market';
import { closeModal } from './game-ui';
import { toast } from './ui';

const $ = (id: string) => document.getElementById(id)!;
const modal = () => $('modal');
const MOIS = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sep', 'Oct', 'Nov', 'Déc'];
const monthName = (m: number) => `${MOIS[m % 12]} ${START_YEAR + Math.floor(m / 12)}`;
const KIND_ROOM: Record<string, string> = { dev: 'Développement', graph: 'Studio graphique', son: 'Studio son', qa: 'Tests (QA)' };

type Tab = 'ledger' | 'bank' | 'contracts' | 'publish' | 'stocks';

export function openFinance(s: GameState, onChange: () => void, start: Tab = 'ledger') {
  let tab: Tab = start;

  const ledger = () => {
    const rows = s.ledger.slice(0, 6);
    if (!rows.length) return '<div class="empty">Les comptes apparaîtront au premier mouvement d’argent.</div>';
    const cats = [...new Set(rows.flatMap(r => Object.keys(r.lines)))]
      .sort((a, b) => rows.reduce((x, r) => x + (r.lines[b] ?? 0), 0) - rows.reduce((x, r) => x + (r.lines[a] ?? 0), 0));
    const total = (r: (typeof rows)[number]) => Object.values(r.lines).reduce((a, v) => a + v, 0);
    return `<div class="tablewrap"><table class="games ledger"><thead><tr><th></th>${rows.map(r => `<th>${monthName(r.month)}</th>`).join('')}</tr></thead><tbody>
      ${cats.map(c => `<tr><td>${c}</td>${rows.map(r => {
        const v = r.lines[c];
        return `<td class="${v > 0 ? 'pos' : v < 0 ? 'neg' : ''}">${v ? money(v) : '–'}</td>`;
      }).join('')}</tr>`).join('')}
      <tr class="tot"><td>Solde du mois</td>${rows.map(r => `<td class="${total(r) >= 0 ? 'pos' : 'neg'}">${money(total(r))}</td>`).join('')}</tr>
    </tbody></table></div>`;
  };

  const bank = () => `
    <div class="sum"><span>Encours : <b>${money(debt(s))}</b></span><span>Plafond : ${money(creditLimit(s))}</span><span>Taux : ${BUSINESS.loanRate * 100} %/mois sur ${BUSINESS.loanMonths} mois</span></div>
    <div class="row">${BUSINESS.loans.map(a => `<button data-loan="${a}" ${debt(s) + a > creditLimit(s) ? 'disabled' : ''}>Emprunter ${money(a)} <small>(${money(annuity(a))}/mois)</small></button>`).join('')}</div>
    ${s.loans.length ? `<div class="elist">${s.loans.map(l => `<div class="ecard"><div class="rh"><b>Prêt de ${money(l.principal)}</b><small>${l.monthsLeft} mois restants</small></div>
      <div class="rh"><small>Reste dû ${money(l.remaining)} · mensualité ${money(l.monthly)}</small><button data-repay="${l.id}" ${s.money < l.remaining ? 'disabled' : ''}>Rembourser tout</button></div></div>`).join('')}</div>`
      : '<div class="empty">Aucun prêt en cours.</div>'}`;

  const contracts = () => `
    <div class="sub" style="color:var(--mute)">Pendant un contrat, toute la production de la salle concernée lui est consacrée : votre jeu en cours avance moins vite. Nouvelles offres chaque mois.</div>
    ${s.contracts.length ? `<h4 class="h4">En cours</h4><div class="elist">${s.contracts.map(c => {
      const days = Math.max(0, Math.ceil((c.deadline - s.time) / DAY_SEC));
      return `<div class="ecard"><div class="rh"><b>${esc(c.client)}</b><small>${days} jours restants</small></div>
        <div class="segs"><div><i style="width:${Math.min(100, (c.progress / c.amount) * 100)}%"></i></div></div>
        <small>${BUSINESS.contractKinds[c.kind].label} · ${Math.floor(c.progress)}/${c.amount} pts · ${money(c.pay)} (pénalité ${money(c.penalty)})</small></div>`;
    }).join('')}</div>` : ''}
    <h4 class="h4">Offres</h4>
    ${s.contractOffers.length ? `<div class="elist">${s.contractOffers.map(c => `<div class="ecard">
      <div class="rh"><b>${esc(c.client)}</b><b>${money(c.pay)}</b></div>
      <small>${BUSINESS.contractKinds[c.kind].label} · salle ${KIND_ROOM[c.kind]} · ${c.amount} pts en ${c.days} jours · pénalité ${money(c.penalty)}</small>
      <button data-contract="${c.id}" ${s.contracts.length >= MAX_CONTRACTS || s.contracts.some(o => o.kind === c.kind) ? 'disabled' : ''}>Accepter</button></div>`).join('')}</div>`
      : '<div class="empty">Aucune offre ce mois-ci.</div>'}`;

  const publish = () => `
    <div class="sub" style="color:var(--mute)">Financez un studio indépendant : vous payez une avance et touchez une part de chaque vente. La note annoncée n’est qu’une estimation.</div>
    ${s.published.length ? `<h4 class="h4">Vos éditions</h4><div class="elist">${s.published.map(p => `<div class="ecard">
      <div class="rh"><b>${esc(p.name)}</b><small>${esc(p.indie)}</small></div>
      <small>${p.released ? `${p.score.toFixed(1)}/10 · ${p.units.toLocaleString('fr-FR')} ventes · ${money(p.revenue)} perçus sur ${money(p.advance)} d’avance`
        : `Sortie dans ${Math.max(0, Math.ceil((p.releaseAt - s.time) / (7 * DAY_SEC)))} semaines`}</small></div>`).join('')}</div>` : ''}
    <h4 class="h4">Propositions</h4>
    ${s.publishOffers.length ? `<div class="elist">${s.publishOffers.map(o => `<div class="ecard">
      <div class="rh"><b>${esc(o.name)}</b><small>${esc(o.indie)}</small></div>
      <small>${esc(o.topic)} / ${o.genre} · note estimée ${o.low} à ${o.high} · votre part ${Math.round(o.share * 100)} % · sortie dans ${o.weeks} semaines</small>
      <button data-publish="${o.id}" ${s.money < o.advance ? 'disabled' : ''}>Éditer (avance ${money(o.advance)})</button></div>`).join('')}</div>`
      : '<div class="empty">Aucune proposition pour le moment.</div>'}`;

  const stocks = () => {
    const act = activeRivals(s);
    return `<div class="sub" style="color:var(--mute)">Achetez des parts de vos concurrents par tranches de ${BUSINESS.shareStep} % : vous touchez des dividendes chaque mois. À 100 %, le studio devient votre filiale.</div>
    <div class="elist">${act.map(r => {
      const pct = s.shares[r.id] ?? 0;
      const price = sharePrice(s, r.id);
      return `<div class="ecard"><div class="rh"><b><i class="dot" style="background:${r.color}"></i>${r.name}${owned(s, r.id) ? ' · filiale' : ''}</b><small>valeur ${money(rivalValue(s, r.id))}</small></div>
        <div class="segs"><div><i style="width:${pct}%"></i></div></div>
        <div class="rh"><small>Vous détenez ${pct} %</small><span class="row">
          <button data-buy="${r.id}" ${pct >= 100 || s.money < price * 1.05 ? 'disabled' : ''}>Acheter ${BUSINESS.shareStep} % (${money(price * 1.05)})</button>
          <button data-sell="${r.id}" ${pct < BUSINESS.shareStep ? 'disabled' : ''}>Vendre (${money(price * 0.95)})</button></span></div></div>`;
    }).join('')}</div>
    ${Object.entries(s.shares).filter(([id, p]) => p > 0 && !act.some(r => r.id === id)).map(([id, p]) => `<small>${RIVAL[id].name} a fermé : vos ${p} % ne valent plus rien.</small>`).join('')}`;
  };

  const render = () => {
    const tabs: [Tab, string][] = [['ledger', 'Bilan'], ['bank', 'Banque'], ['contracts', 'Contrats'], ['publish', 'Édition'], ['stocks', 'Bourse']];
    const body = { ledger, bank, contracts, publish, stocks }[tab]();
    modal().innerHTML = `<div class="dialog" role="dialog" aria-modal="true" aria-labelledby="fi-t" style="max-width:900px">
      <header><h3 id="fi-t">Finances</h3><span class="rp">${money(s.money)}</span><button data-close>Fermer</button></header>
      <div class="mtabs" role="tablist">${tabs.map(([id, l]) => `<button role="tab" data-tab="${id}" aria-selected="${tab === id}">${l}</button>`).join('')}</div>
      ${body}
    </div>`;
  };
  render();

  const act = (err: string | null) => { if (err) toast(err, true); render(); onChange(); };
  modal().onclick = ev => {
    const t = ev.target as HTMLElement;
    if (t === modal() || t.closest('[data-close]')) { closeModal(); return; }
    const b = t.closest<HTMLElement>('button');
    if (!b) return;
    const d = b.dataset;
    if (d.tab) { tab = d.tab as Tab; render(); }
    else if (d.loan) act(takeLoan(s, +d.loan));
    else if (d.repay) act(repayLoan(s, +d.repay));
    else if (d.contract) act(acceptContract(s, +d.contract));
    else if (d.publish) act(acceptPublish(s, +d.publish));
    else if (d.buy) act(buyShares(s, d.buy));
    else if (d.sell) act(sellShares(s, d.sell));
  };
}
