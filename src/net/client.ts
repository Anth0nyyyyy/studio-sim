import { AWARDS } from '../core/data';
import { emit } from '../core/events';
import { book } from '../core/ledger';
import { log } from '../core/log';
import { NET, myStudio, toGlobalPlatform, toLocalPlatform } from '../core/net-state';
import { newGame } from '../core/state';
import { START_YEAR, monthIndex, weekIndex } from '../core/time';
import type { AwardResult, GameState, Market } from '../core/types';
import { consoleMarket, consolePlatformId } from '../sim/hardware';
import { addFans } from '../sim/market';
import { GAME_ID_SPAN, type ClientMsg, type Report, type ServerMsg } from './protocol';

export interface NetHooks {
  getState: () => GameState;
  setState: (s: GameState) => void;
  onChange: () => void;
  onError: (text: string) => void;
}

let ws: WebSocket | null = null;
let hooks: NetHooks | null = null;

const TOKEN_KEY = 'studio-sim-token';
export function token(): string {
  try {
    let t = localStorage.getItem(TOKEN_KEY);
    if (!t) { t = Math.random().toString(36).slice(2) + Date.now().toString(36); localStorage.setItem(TOKEN_KEY, t); }
    return t;
  } catch { return 'invite-' + Math.random().toString(36).slice(2); }
}

export const saveKey = () => `studio-sim-mp:${NET.url}:${NET.pid}`;
export const wsUrl = (address: string) => {
  const u = new URL(address.includes('://') ? address : `https://${address}`);
  u.protocol = u.protocol === 'http:' ? 'ws:' : 'wss:';
  u.pathname = '/ws';
  return u.toString();
};

export function send(m: ClientMsg) {
  if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(m));
}

export function connect(address: string, name: string, color: string, h: NetHooks) {
  disconnect();
  hooks = h;
  let url: string;
  try { url = wsUrl(address); } catch { h.onError('Adresse invalide'); return; }
  NET.url = new URL(url).host;
  ws = new WebSocket(url);
  ws.onopen = () => send({ type: 'hello', token: token(), name, color });
  ws.onmessage = e => { try { handle(JSON.parse(String(e.data)) as ServerMsg); } catch (err) { console.error(err); } };
  ws.onclose = () => {
    const was = NET.online;
    NET.online = false; NET.weekHook = null; ws = null;
    if (was) h.onError('Déconnecté de la partie. Vous pouvez vous reconnecter depuis « Multijoueur ».');
    else h.onError('Connexion impossible : vérifiez l’adresse et que le serveur de l’hôte tourne.');
    h.onChange();
  };
}

export function disconnect() {
  if (!ws) return;
  const sock = ws;
  ws = null;
  NET.online = false; NET.weekHook = null;
  sock.onclose = null;
  sock.close();
}

/** Temps serveur estimé maintenant (extrapolé depuis la dernière horloge reçue). */
export function serverNow(): number {
  return NET.serverTime + ((performance.now() - NET.receivedAt) / 1000) * NET.serverSpeed;
}

export function buildReport(s: GameState): Report {
  return {
    games: s.games.map(g => ({
      id: g.id, name: g.name, topic: g.topic, genre: g.genre, score: g.score, weekly: g.weekly, units: g.units,
      releasedAt: g.releasedAt, platforms: g.platforms.map(toGlobalPlatform),
    })),
    consoles: s.consoles.filter(c => c.phase !== 'dev').map(c => ({
      id: toGlobalPlatform(consolePlatformId(c)), name: c.name, market: consoleMarket(c),
      from: START_YEAR + Math.floor(monthIndex(c.launchedAt) / 12),
      to: c.phase === 'retired' ? START_YEAR + Math.floor(monthIndex(c.retiredAt) / 12) + 1 : 2200,
    })),
    money: Math.round(s.money), fans: Math.round(s.fans),
  };
}

function loadOrCreate(time: number): GameState {
  try {
    const raw = localStorage.getItem(saveKey());
    if (raw) {
      const s = JSON.parse(raw) as GameState;
      if (s.version === newGame().version) return s;
    }
  } catch { /* stockage indisponible */ }
  const s = newGame();
  s.time = time;
  s.lastMonth = monthIndex(time);
  s.lastWeek = weekIndex(time);
  s.tutorial = -1;
  log(s, 'Bienvenue dans la partie partagée : le temps et le marché sont communs à tous les joueurs.');
  return s;
}

function applyMarket(s: GameState, m: Market) {
  const me = myStudio();
  s.market = {
    ...m,
    games: m.games.filter(g => g.studio !== me),
    chart: m.chart.map(e => e.studio === me ? { ...e, kind: 'player' as const, id: e.id % GAME_ID_SPAN } : e),
    awards: m.awards.map(a => ({ ...a, player: a.studio === me })),
  };
}

function handle(m: ServerMsg) {
  if (!hooks) return;
  const h = hooks;
  switch (m.type) {
    case 'welcome': {
      NET.pid = m.pid; NET.online = true;
      NET.serverTime = m.time; NET.serverSpeed = m.speed; NET.receivedAt = performance.now();
      const s = loadOrCreate(m.time);
      NET.weekHook = st => send({ type: 'report', report: buildReport(st) });
      h.setState(s);
      send({ type: 'report', report: buildReport(s) });
      break;
    }
    case 'clock':
      NET.serverTime = m.time; NET.serverSpeed = m.speed; NET.pausedBy = m.pausedBy; NET.receivedAt = performance.now();
      return;
    case 'market':
      NET.platforms = m.platforms.filter(p => p.owner !== NET.pid);
      applyMarket(h.getState(), m.market);
      break;
    case 'players':
      NET.players = m.players;
      NET.names = Object.fromEntries(m.players.map(p => [`p:${p.pid}`, { name: p.name, color: p.color }]));
      break;
    case 'royalties': {
      const s = h.getState();
      const c = s.consoles.find(o => consolePlatformId(o) === toLocalPlatform(m.console));
      if (c) c.royalties += m.amount;
      book(s, 'royalties', m.amount);
      break;
    }
    case 'dividend': {
      const s = h.getState();
      book(s, 'dividendes', m.amount);
      log(s, `Dividendes du studio de ${m.from} : +${m.amount.toLocaleString('fr-FR')} $.`);
      break;
    }
    case 'shares': {
      const s = h.getState();
      if (!m.ok) { h.onError(m.error ?? 'Opération refusée'); break; }
      book(s, m.amount < 0 ? 'achats d’actions' : 'ventes d’actions', m.amount);
      s.shares[`p:${m.target}`] = m.pct;
      break;
    }
    case 'awards': {
      const s = h.getState();
      const me = myStudio();
      const results: AwardResult[] = m.results.map(r => ({ ...r, player: r.studio === me }));
      const won = results.filter(r => r.player).length;
      if (won) {
        const prize = Math.round(AWARDS.prize * (1 + (m.year + 1 - START_YEAR) * 0.08)) * won;
        book(s, 'trophées', prize);
        addFans(s, s.games[0]?.genre ?? 'Action', Math.round(s.fans * 0.05 + 500 * won));
      }
      emit('awards', { year: m.year, results, won });
      break;
    }
    case 'expo':
      emit('expo', { year: m.year });
      break;
    case 'chat':
      NET.chat.push(...m.lines);
      if (NET.chat.length > 150) NET.chat.splice(0, NET.chat.length - 150);
      NET.unread += m.lines.filter(l => !l.system).length;
      break;
    case 'error':
      h.onError(m.text);
      break;
  }
  h.onChange();
}
