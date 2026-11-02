import { ENGINE_CAT_LABEL, RESEARCH } from '../core/data';
import { DAY_SEC } from '../core/time';
import { ENGINE_CATS, type EngineCat, type GameState, type ResearchDef } from '../core/types';
import { esc, money } from '../core/util';
import {
  bestFeatures, buyResearch, createEngine, engineBuilding, engineCost, engineDays, engineRatio, engineReady,
  engineTech, featuresFor, lockReason, researchStatus, setLicensed,
} from '../sim/research';
import { closeModal } from './game-ui';
import { toast } from './ui';

const $ = (id: string) => document.getElementById(id)!;
const modal = () => $('modal');

const GROUP_ORDER = ['Graphismes', 'Son', 'Contrôles', 'IA', 'Physique', 'Production', 'Studio', 'Sujets'];

/* ---------- Recherche ---------- */
export function openResearch(s: GameState, onChange: () => void) {
  const card = (r: ResearchDef) => {
    const st = researchStatus(s, r);
    const afford = s.rp >= r.rp && s.money >= r.money;
    const desc = r.desc ?? (r.value ? `Fonction de moteur · valeur ${r.value}` : '');
    return `<div class="rcard ${st}">
      <div class="rh"><b>${r.name}</b><small>${r.year}</small></div>
      ${desc ? `<small>${desc}</small>` : ''}
      ${st === 'done' ? '<small class="ok">Acquis</small>'
        : st === 'locked' ? `<small>Requiert : ${lockReason(s, r)}</small>`
        : `<button class="primary" data-res="${r.id}" ${afford ? '' : 'disabled'}>${r.rp} RP${r.money ? ' · ' + money(r.money) : ''}</button>`}
    </div>`;
  };
  const render = () => {
    const groups = GROUP_ORDER.map(g => ({ g, items: RESEARCH.filter(r => r.group === g && !r.base) })).filter(x => x.items.length);
    modal().innerHTML = `<div class="dialog" role="dialog" aria-modal="true" aria-labelledby="rs-t" style="max-width:1000px">
      <header><h3 id="rs-t">Recherche</h3><span class="rp">${Math.floor(s.rp)} RP · ${money(s.money)}</span><button data-close>Fermer</button></header>
      <div class="sub" style="color:var(--mute)">Les points de recherche (RP) viennent de la salle Recherche. Les fonctions de moteur s’utilisent ensuite dans « Moteurs ».</div>
      ${groups.map(({ g, items }) => `<section class="rgroup"><h4>${g}</h4><div class="rgrid">${items.map(card).join('')}</div></section>`).join('')}
    </div>`;
  };
  render();
  modal().onclick = ev => {
    const t = ev.target as HTMLElement;
    if (t === modal() || t.closest('[data-close]')) { closeModal(); return; }
    const b = t.closest<HTMLElement>('[data-res]');
    if (!b) return;
    const err = buyResearch(s, b.dataset.res!);
    if (err) toast(err, true);
    render(); onChange();
  };
}

/* ---------- Moteurs ---------- */
export function openEngines(s: GameState, onChange: () => void) {
  let draft: { name: string; features: Record<EngineCat, string> } | null = null;

  const list = () => s.engines.slice().reverse().map(e => {
    const ready = engineReady(s, e);
    const ratio = engineRatio(s, e, 'Action');
    const daysLeft = Math.ceil((e.readyAt - s.time) / DAY_SEC);
    return `<div class="ecard">
      <div class="rh"><b>${esc(e.name)}</b><small>tech ${e.tech.toFixed(1)}</small></div>
      <div class="efeat">${ENGINE_CATS.map(c => `<span><em>${ENGINE_CAT_LABEL[c]}</em>${RESEARCH.find(r => r.id === e.features[c])!.name}</span>`).join('')}</div>
      <div class="rh">
        <small>${ready ? (ratio >= 1 ? 'À la pointe' : ratio >= 0.8 ? 'Correct' : 'Dépassé') : `En construction · ${daysLeft} j`}</small>
        ${ready ? `<label class="lic"><input type="checkbox" data-lic="${e.id}" ${e.licensed ? 'checked' : ''} ${s.done.enginelic ? '' : 'disabled'}> Louer aux autres studios${e.licenseIncome ? ` · ${money(e.licenseIncome)} gagnés` : ''}</label>` : ''}
      </div>
    </div>`;
  }).join('');

  const form = () => {
    if (!draft) return '';
    const cost = engineCost(draft.features);
    return `<div class="eform">
      <label class="field"><span>Nom du moteur</span><input type="text" id="en-name" maxlength="30" value="${esc(draft.name)}"></label>
      ${ENGINE_CATS.map(c => `<label class="field"><span>${ENGINE_CAT_LABEL[c]}</span><select data-cat="${c}">${featuresFor(s, c).map(r =>
        `<option value="${r.id}" ${draft!.features[c] === r.id ? 'selected' : ''}>${r.name} (valeur ${r.value})</option>`).join('')}</select></label>`).join('')}
      <div class="sum"><span>Tech : <b>${engineTech(draft.features).toFixed(1)}</b></span><span>Coût : <b>${money(cost)}</b></span><span>Durée : ${engineDays(draft.features)} jours</span></div>
      <div class="row"><button class="primary" id="en-go" ${s.money < cost ? 'disabled' : ''}>Construire</button><button id="en-x">Annuler</button></div>
    </div>`;
  };

  const render = () => {
    const building = engineBuilding(s);
    modal().innerHTML = `<div class="dialog" role="dialog" aria-modal="true" aria-labelledby="en-t" style="max-width:760px">
      <header><h3 id="en-t">Moteurs</h3><button data-close>Fermer</button></header>
      <div class="sub" style="color:var(--mute)">Un moteur à jour améliore la note des jeux, surtout dans les domaines importants pour leur genre. Plus il est riche, plus le développement demande de travail.</div>
      ${draft ? form() : `<div class="row"><button class="primary" id="en-new" ${building ? 'disabled' : ''}>Nouveau moteur</button>${building ? `<small style="color:var(--mute)">${esc(building.name)} est en construction.</small>` : ''}</div>`}
      <div class="elist">${list()}</div>
    </div>`;
  };
  render();

  modal().onchange = ev => {
    const t = ev.target as HTMLElement;
    if (t instanceof HTMLSelectElement && draft) { draft.features[t.dataset.cat as EngineCat] = t.value; draft.name = ($('en-name') as HTMLInputElement).value; render(); }
    if (t instanceof HTMLInputElement && t.dataset.lic) {
      const err = setLicensed(s, +t.dataset.lic, t.checked);
      if (err) toast(err, true);
      render(); onChange();
    }
  };
  modal().onclick = ev => {
    const t = ev.target as HTMLElement;
    if (t === modal() || t.closest('[data-close]')) { modal().onchange = null; closeModal(); return; }
    if (t.id === 'en-new') { draft = { name: `Moteur ${s.engines.length + 1}`, features: bestFeatures(s) }; render(); }
    if (t.id === 'en-x') { draft = null; render(); }
    if (t.id === 'en-go' && draft) {
      draft.name = ($('en-name') as HTMLInputElement).value;
      const err = createEngine(s, draft.name, draft.features);
      if (err) toast(err, true); else draft = null;
      render(); onChange();
    }
  };
}
