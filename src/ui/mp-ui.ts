import { NET } from '../core/net-state';
import type { GameState } from '../core/types';
import { esc, money } from '../core/util';
import { connect, disconnect, send, type NetHooks } from '../net/client';
import { closeModal } from './game-ui';
import { toast } from './ui';

const $ = (id: string) => document.getElementById(id)!;
const modal = () => $('modal');
const COLORS = ['#ffb347', '#5fd3e6', '#93d36b', '#ff7a59', '#b98cff', '#ff9ecf', '#ffd166', '#7fa7d9'];
const PREF_KEY = 'studio-sim-mp-prefs';

function prefs(): { address: string; name: string; color: string } {
  const def = { address: location.protocol.startsWith('http') && !/:(5173|4173)$/.test(location.host) ? location.origin : '', name: '', color: COLORS[0] };
  try { return { ...def, ...JSON.parse(localStorage.getItem(PREF_KEY) ?? '{}') }; } catch { return def; }
}
function savePrefs(p: { address: string; name: string; color: string }) {
  try { localStorage.setItem(PREF_KEY, JSON.stringify(p)); } catch { /* stockage indisponible */ }
}

export function openMultiplayer(s: () => GameState, hooks: NetHooks) {
  const p = prefs();
  const render = () => {
    if (!NET.online) {
      modal().innerHTML = `<div class="dialog" role="dialog" aria-modal="true" aria-labelledby="mp-t" style="max-width:520px">
        <header><h3 id="mp-t">Multijoueur</h3><button data-close>Fermer</button></header>
        <div class="sub" style="color:var(--mute)">Rejoignez la partie d’un ami : le temps, le marché, les consoles et la bourse sont partagés. Votre studio solo reste intact.</div>
        <label class="field"><span>Adresse de la partie</span><input type="text" id="mp-addr" placeholder="https://xxxx.trycloudflare.com" value="${esc(p.address)}"></label>
        <label class="field"><span>Nom de votre studio</span><input type="text" id="mp-name" maxlength="20" value="${esc(p.name)}"></label>
        <div class="field"><span>Couleur</span><div class="chips">${COLORS.map(c => `<button class="chip swatch" data-color="${c}" aria-pressed="${p.color === c}" style="--c:${c}" aria-label="Couleur ${c}"></button>`).join('')}</div></div>
        <div class="row"><button class="primary" id="mp-go">Rejoindre</button></div>
      </div>`;
      return;
    }
    const meHolders = (pid: number) => NET.players.find(x => x.pid === pid)?.holders ?? {};
    modal().innerHTML = `<div class="dialog" role="dialog" aria-modal="true" aria-labelledby="mp-t" style="max-width:820px">
      <header><h3 id="mp-t">Partie partagée</h3><span class="rp">${esc(NET.url)}</span><button data-close>Fermer</button></header>
      <div class="sub" style="color:var(--mute)">Vitesse commune : la plus lente demandée. Une pause d’un joueur met tout le monde en pause. Achetez des parts des studios de vos amis par tranches de 10 % pour toucher leurs dividendes.</div>
      <div class="elist">${NET.players.map(pl => {
        const mine = pl.pid === NET.pid;
        const held = meHolders(pl.pid)[NET.pid] ?? 0;
        const total = Object.values(pl.holders).reduce((a, v) => a + v, 0);
        const owners = Object.entries(pl.holders).map(([h, v]) => `${esc(NET.players.find(x => x.pid === +h)?.name ?? '?')} ${v} %`).join(', ');
        const price = pl.value / 10;
        return `<div class="ecard">
          <div class="rh"><b><i class="dot" style="background:${pl.color}"></i>${esc(pl.name)}${mine ? ' (vous)' : ''}</b>
            <small>${pl.online ? (pl.vote === 0 ? 'en pause' : `en ligne · x${pl.vote}`) : 'hors ligne'}</small></div>
          <div class="efeat"><span><em>Trésorerie</em>${money(pl.money)}</span><span><em>Fans</em>${Math.round(pl.fans).toLocaleString('fr-FR')}</span>
            <span><em>Jeux</em>${pl.games}</span><span><em>Valeur</em>${money(pl.value)}</span>${owners ? `<span><em>Actionnaires</em>${owners}</span>` : ''}</div>
          ${mine ? '' : `<div class="rh"><small>Vous détenez ${held} %</small><span class="row">
            <button data-buy="${pl.pid}" ${total >= 100 || s().money < price * 1.05 ? 'disabled' : ''}>Acheter 10 % (${money(price * 1.05)})</button>
            <button data-sell="${pl.pid}" ${held < 10 ? 'disabled' : ''}>Vendre (${money(price * 0.95)})</button></span></div>`}
        </div>`;
      }).join('')}</div>
      <div class="row"><button class="danger" id="mp-quit">Quitter la partie</button></div>
    </div>`;
  };
  render();
  modal().onclick = ev => {
    const t = ev.target as HTMLElement;
    if (t === modal() || t.closest('[data-close]')) { closeModal(); return; }
    const c = t.closest<HTMLElement>('[data-color]');
    if (c) { p.color = c.dataset.color!; p.address = ($('mp-addr') as HTMLInputElement).value; p.name = ($('mp-name') as HTMLInputElement).value; render(); return; }
    if (t.id === 'mp-go') {
      p.address = ($('mp-addr') as HTMLInputElement).value.trim();
      p.name = ($('mp-name') as HTMLInputElement).value.trim();
      if (!p.address) { toast('Indiquez l’adresse de la partie.', true); return; }
      if (!p.name) { toast('Donnez un nom à votre studio.', true); return; }
      savePrefs(p);
      closeModal();
      toast('Connexion…');
      connect(p.address, p.name, p.color, hooks);
      return;
    }
    if (t.id === 'mp-quit') { disconnect(); closeModal(); hooks.onChange(); toast('Vous avez quitté la partie. Retour à votre studio solo.'); return; }
    const b = t.closest<HTMLElement>('[data-buy],[data-sell]');
    if (b?.dataset.buy) { send({ type: 'buyShares', target: +b.dataset.buy }); setTimeout(render, 300); }
    if (b?.dataset.sell) { send({ type: 'sellShares', target: +b.dataset.sell }); setTimeout(render, 300); }
  };
}

/* ---------- Chat ---------- */
let chatOpen = false;
let shown = -1;
export function toggleChat() {
  chatOpen = !chatOpen;
  if (chatOpen) NET.unread = 0;
  shown = -1;
  renderChat();
}
export function renderChat() {
  const el = $('chat');
  const btn = $('b-chat');
  btn.hidden = !NET.online;
  btn.textContent = NET.unread && !chatOpen ? `Chat (${NET.unread})` : 'Chat';
  el.hidden = !NET.online || !chatOpen;
  if (el.hidden || shown === NET.chat.length) return;
  shown = NET.chat.length;
  NET.unread = 0;
  const list = el.querySelector('.lines') ?? (() => {
    el.innerHTML = `<div class="rh"><b>Chat</b><button data-close-chat>Fermer</button></div><div class="lines"></div>
      <form class="row" id="chat-form"><input type="text" id="chat-in" maxlength="300" placeholder="Votre message" autocomplete="off"><button class="primary">Envoyer</button></form>`;
    el.querySelector('[data-close-chat]')!.addEventListener('click', toggleChat);
    el.querySelector('#chat-form')!.addEventListener('submit', e => {
      e.preventDefault();
      const i = $('chat-in') as HTMLInputElement;
      if (i.value.trim()) send({ type: 'chat', text: i.value.trim() });
      i.value = '';
    });
    return el.querySelector('.lines')!;
  })();
  list.innerHTML = NET.chat.map(l => `<p class="${l.system ? 'sys' : ''}"><b style="color:${l.color}">${esc(l.from)}</b> ${esc(l.text)}</p>`).join('');
  list.scrollTop = list.scrollHeight;
}

export function renderNetStatus() {
  const el = $('h-net');
  el.hidden = !NET.online;
  if (!NET.online) return;
  const online = NET.players.filter(p => p.online).length;
  const sp = NET.serverSpeed === 0 ? (NET.pausedBy.length ? `pause (${NET.pausedBy.join(', ')})` : 'pause') : `x${NET.serverSpeed}`;
  el.innerHTML = `<b>${online} en ligne</b><span>Partie · ${esc(sp)}</span>`;
}
