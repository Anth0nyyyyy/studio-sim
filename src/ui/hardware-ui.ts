import { HARDWARE } from '../core/data';
import { PART_IDS, type ConsoleForm, type ConsoleSpec, type GameState, type PartId } from '../core/types';
import { esc, money } from '../core/util';
import {
  availableTiers, bestParts, consoleDevCost, consoleMarket, consolePerf, consoleTarget, consoleUnitCost, designConsole,
  expectedPerf, library, orderConsoles, referencePrice, retireConsole, validateConsole, weeklyDemand,
} from '../sim/hardware';
import { closeModal } from './game-ui';
import { toast } from './ui';

const $ = (id: string) => document.getElementById(id)!;
const modal = () => $('modal');
const PRICE_STEPS = [0.8, 1, 1.2, 1.5];

export function openConsoles(s: GameState, onChange: () => void) {
  let draft: ConsoleSpec | null = null;
  let confirmRetire = 0;

  const form = () => {
    if (!draft) return '';
    const d = draft;
    const perf = consolePerf(d), exp = expectedPerf(s, d.form), unit = consoleUnitCost(s, d), ref = referencePrice(s, d.form);
    const err = validateConsole(s, d);
    return `<div class="eform">
      <label class="field"><span>Nom</span><input type="text" id="hw-name" maxlength="24" value="${esc(d.name)}"></label>
      <label class="field"><span>Format</span><select data-form>${(Object.keys(HARDWARE.forms) as ConsoleForm[]).map(f =>
        `<option value="${f}" ${d.form === f ? 'selected' : ''}>${HARDWARE.forms[f].label}</option>`).join('')}</select></label>
      ${PART_IDS.map(p => `<label class="field"><span>${HARDWARE.parts[p].label}</span><select data-part="${p}">${availableTiers(s, p).map(i => {
        const [name, , pf, cost] = HARDWARE.parts[p].tiers[i];
        return `<option value="${i}" ${d.parts[p] === i ? 'selected' : ''}>${name} (perf ${pf}, ${cost} $)</option>`;
      }).join('')}</select></label>`).join('')}
      <div class="field" style="grid-column:1/-1"><span>Prix en magasin (référence de l’époque : ${money(ref)})</span><div class="chips">${PRICE_STEPS.map(k => {
        const v = Math.round(ref * k);
        return `<button class="chip" data-price="${v}" aria-pressed="${d.price === v}">${money(v)}<em>${v < unit / HARDWARE.retailShare ? 'à perte' : `marge ${money(v * HARDWARE.retailShare - unit)}`}</em></button>`;
      }).join('')}</div></div>
      <div class="sum"><span>Performance <b>${perf.toFixed(1)}</b> (marché ${exp.toFixed(1)})</span><span>Fabrication ${money(unit)}/unité</span>
        <span>R&amp;D ${money(consoleDevCost(s, d))}</span><span>${consoleTarget(d)} pts d’atelier hardware</span></div>
      ${err ? `<div class="warn">${err}</div>` : ''}
      <div class="row"><button class="primary" id="hw-go" ${err ? 'disabled' : ''}>Lancer la conception</button><button id="hw-x">Annuler</button></div>
    </div>`;
  };

  const list = () => s.consoles.slice().reverse().map(c => {
    if (c.phase === 'dev') {
      return `<div class="ecard"><div class="rh"><b>${esc(c.name)}</b><small>${HARDWARE.forms[c.form].label} · en conception</small></div>
        <div class="segs"><div><i style="width:${Math.min(100, (c.progress / c.target) * 100)}%"></i></div></div>
        <small>${Math.floor(c.progress)}/${c.target} pts · l’atelier hardware y travaille</small></div>`;
    }
    const live = c.phase === 'live';
    const demand = live ? weeklyDemand(s, c) : 0;
    return `<div class="ecard"><div class="rh"><b>${esc(c.name)}</b><small>${HARDWARE.forms[c.form].label} · ${live ? 'en vente' : 'production arrêtée'}</small></div>
      <div class="efeat"><span><em>Base installée</em>${c.installed.toLocaleString('fr-FR')}</span>
        ${live ? `<span><em>Ventes/sem.</em>${c.weekly.toLocaleString('fr-FR')}</span><span><em>Demande</em>${demand.toLocaleString('fr-FR')}</span><span><em>Stock</em>${c.stock.toLocaleString('fr-FR')}</span>` : ''}
        <span><em>Prix</em>${money(c.price)}</span><span><em>Coût</em>${money(c.unitCost)}</span>
        <span><em>Ventes</em>${money(c.revenue)}</span><span><em>Royalties</em>${money(c.royalties)}</span>
        <span><em>Bibliothèque</em>${library(s, c).toFixed(1)}</span><span><em>Poids marché</em>×${consoleMarket(c).toFixed(2)}</span></div>
      ${live ? `<div class="row">
        <button data-order="${c.id}:10000">Fabriquer 10 000 (${money(10000 * c.unitCost)})</button>
        <label class="lic"><input type="checkbox" data-auto="${c.id}" ${c.auto ? 'checked' : ''}> Réassort auto</label>
        <button class="danger" data-retire="${c.id}">${confirmRetire === c.id ? 'Confirmer l’arrêt ?' : 'Arrêter la production'}</button></div>` : ''}
    </div>`;
  }).join('');

  const render = () => {
    const devBusy = s.consoles.some(c => c.phase === 'dev');
    modal().innerHTML = `<div class="dialog" role="dialog" aria-modal="true" aria-labelledby="hw-t" style="max-width:860px">
      <header><h3 id="hw-t">Consoles</h3><span class="rp">${money(s.money)}</span><button data-close>Fermer</button></header>
      <div class="sub" style="color:var(--mute)">Concevez une console avec l’atelier hardware, fabriquez-la et vendez-la. Elle devient une plateforme : vos jeux y sont mieux vendus, et chaque jeu concurrent vous rapporte ${HARDWARE.royalty} $ par copie.</div>
      ${!s.done.hwlab ? '<div class="warn">Recherchez « Conception matérielle » (1985) pour concevoir une console.</div>'
        : draft ? form() : `<div class="row"><button class="primary" id="hw-new" ${devBusy ? 'disabled' : ''}>Concevoir une console</button>${devBusy ? '<small style="color:var(--mute)">Une console est déjà en conception.</small>' : ''}</div>`}
      ${s.consoles.length ? `<div class="elist">${list()}</div>` : ''}
    </div>`;
  };
  render();

  const syncName = () => { const n = document.getElementById('hw-name') as HTMLInputElement | null; if (n && draft) draft.name = n.value; };
  modal().onchange = ev => {
    const t = ev.target as HTMLInputElement | HTMLSelectElement;
    if (draft && t instanceof HTMLSelectElement) {
      syncName();
      if (t.dataset.part) draft.parts[t.dataset.part as PartId] = +t.value;
      if (t.dataset.form !== undefined) { draft.form = t.value as ConsoleForm; draft.price = referencePrice(s, draft.form); }
      render(); return;
    }
    if (t instanceof HTMLInputElement && t.dataset.auto) {
      const c = s.consoles.find(o => o.id === +t.dataset.auto!);
      if (c) c.auto = t.checked;
      render();
    }
  };
  modal().onclick = ev => {
    const t = ev.target as HTMLElement;
    if (t === modal() || t.closest('[data-close]')) { closeModal(); return; }
    const b = t.closest<HTMLElement>('button');
    if (!b) return;
    if (b.id === 'hw-new') { draft = { name: `Console ${s.consoles.length + 1}`, form: 'home', parts: bestParts(s), price: referencePrice(s, 'home') }; render(); return; }
    if (b.id === 'hw-x') { draft = null; render(); return; }
    if (b.dataset.price && draft) { syncName(); draft.price = +b.dataset.price; render(); return; }
    if (b.id === 'hw-go' && draft) {
      syncName();
      const err = designConsole(s, draft);
      if (err) toast(err, true); else draft = null;
      render(); onChange(); return;
    }
    if (b.dataset.order) {
      const [id, q] = b.dataset.order.split(':');
      const err = orderConsoles(s, s.consoles.find(c => c.id === +id)!, +q);
      if (err) toast(err, true);
      render(); onChange(); return;
    }
    if (b.dataset.retire) {
      const id = +b.dataset.retire;
      if (confirmRetire !== id) { confirmRetire = id; render(); return; }
      retireConsole(s, s.consoles.find(c => c.id === id)!);
      confirmRetire = 0; render(); onChange();
    }
  };
}
