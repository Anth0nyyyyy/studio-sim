/**
 * Serveur multijoueur à lancer chez l'hôte : `npm run server`.
 * Sert le jeu (dossier dist) et la partie partagée (WebSocket sur /ws) sur le même port.
 */
import { createServer } from 'node:http';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';
import { WebSocketServer, type WebSocket } from 'ws';
import type { ClientMsg, ServerMsg } from '../src/net/protocol';
import {
  advance, applyReport, buyShares, chat, createWorld, effectiveSpeed, join as joinWorld, leave, pausedBy, publicPlayers,
  sellShares, sharedPlatforms, type Outbox, type World,
} from './world';

const PORT = Number(process.env.PORT ?? 8787);
const ROOT = resolve(process.env.DIST ?? 'dist');
const SAVE = resolve(process.env.SAVE ?? 'server/world-save.json');

let world: World = createWorld();
if (existsSync(SAVE)) {
  try { world = JSON.parse(readFileSync(SAVE, 'utf8')); console.log(`Partie reprise (${SAVE}).`); }
  catch { console.warn('Sauvegarde illisible, nouvelle partie.'); }
}
for (const p of Object.values(world.players)) p.online = false;

/* ---------- Fichiers du jeu ---------- */
const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon',
};
const http = createServer((req, res) => {
  const url = decodeURIComponent((req.url ?? '/').split('?')[0]);
  let file = normalize(join(ROOT, url === '/' ? 'index.html' : url));
  if (!file.startsWith(ROOT)) { res.writeHead(403).end(); return; }
  if (!existsSync(file)) file = join(ROOT, 'index.html');
  if (!existsSync(file)) { res.writeHead(500).end('Lancez d’abord « npm run build ».'); return; }
  res.writeHead(200, { 'Content-Type': MIME[extname(file)] ?? 'application/octet-stream' });
  res.end(readFileSync(file));
});

/* ---------- Partie partagée ---------- */
const wss = new WebSocketServer({ server: http, path: '/ws' });
const sockets = new Map<WebSocket, number>();

const send = (ws: WebSocket, m: ServerMsg) => { if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(m)); };
const broadcast = (m: ServerMsg) => { for (const ws of sockets.keys()) send(ws, m); };
const deliver = (out: Outbox) => {
  out.broadcast.forEach(broadcast);
  for (const [pid, m] of out.direct) for (const [ws, p] of sockets) if (p === pid) send(ws, m);
};
const sendPlayers = () => broadcast({ type: 'players', players: publicPlayers(world) });

wss.on('connection', ws => {
  ws.on('message', raw => {
    let msg: ClientMsg;
    try { msg = JSON.parse(String(raw)); } catch { return; }
    if (msg.type === 'hello') {
      const pid = joinWorld(world, msg.token, msg.name, msg.color);
      sockets.set(ws, pid);
      send(ws, { type: 'welcome', pid, time: world.time, speed: effectiveSpeed(world) });
      send(ws, { type: 'market', market: world.market, platforms: sharedPlatforms(world) });
      send(ws, { type: 'chat', lines: world.chat.slice(-50) });
      broadcast(chat(world, `${world.players[pid].name} a rejoint la partie.`));
      sendPlayers();
      return;
    }
    const pid = sockets.get(ws);
    if (pid === undefined) return;
    const me = world.players[pid];
    switch (msg.type) {
      case 'speed': me.vote = [0, 1, 2, 4].includes(msg.v) ? msg.v : 1; sendPlayers(); break;
      case 'report': applyReport(world, pid, msg.report); break;
      case 'chat': if (msg.text.trim()) broadcast(chat(world, msg.text.trim(), me)); break;
      case 'buyShares': deliver(buyShares(world, pid, msg.target)); break;
      case 'sellShares': deliver(sellShares(world, pid, msg.target)); break;
    }
  });
  ws.on('close', () => {
    const pid = sockets.get(ws);
    sockets.delete(ws);
    if (pid === undefined || [...sockets.values()].includes(pid)) return;
    leave(world, pid);
    broadcast(chat(world, `${world.players[pid]?.name ?? 'Un joueur'} a quitté la partie.`));
    sendPlayers();
  });
});

let last = Date.now();
setInterval(() => {
  const now = Date.now();
  deliver(advance(world, Math.min(1, (now - last) / 1000)));
  last = now;
}, 100);
setInterval(() => broadcast({ type: 'clock', time: world.time, speed: effectiveSpeed(world), pausedBy: pausedBy(world) }), 250);
setInterval(() => { try { writeFileSync(SAVE, JSON.stringify(world)); } catch (e) { console.warn('Sauvegarde impossible', e); } }, 30000);

http.listen(PORT, () => {
  console.log(`Studio Sim multijoueur : http://localhost:${PORT}`);
  console.log('Partagez l’adresse publique de votre tunnel avec vos amis (voir MULTIJOUEUR.md).');
});
