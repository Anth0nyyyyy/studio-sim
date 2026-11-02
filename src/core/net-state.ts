import type { ChatLine, PlayerInfo, SharedPlatform } from '../net/protocol';
import type { GameState } from './types';

/** État réseau partagé entre la simulation et l'interface (vide en solo). */
export const NET = {
  online: false,
  pid: 0,
  url: '',
  serverTime: 0,
  serverSpeed: 0,
  receivedAt: 0,
  pausedBy: [] as string[],
  players: [] as PlayerInfo[],
  /** Noms et couleurs des studios des joueurs, par identifiant "p:N" */
  names: {} as Record<string, { name: string; color: string }>,
  /** Consoles des autres joueurs, utilisables comme plateformes */
  platforms: [] as SharedPlatform[],
  chat: [] as ChatLine[],
  unread: 0,
  /** Appelé par la simulation à chaque nouvelle semaine locale (envoi du rapport). */
  weekHook: null as null | ((s: GameState) => void),
};

export const myStudio = () => `p:${NET.pid}`;
/** "own12" → "p3:own12" pour mes consoles, inchangé sinon. */
export const toGlobalPlatform = (id: string) => (NET.online && id.startsWith('own') ? `p${NET.pid}:${id}` : id);
/** "p3:own12" → "own12" si c'est une de mes consoles. */
export const toLocalPlatform = (id: string) => (NET.online && id.startsWith(`p${NET.pid}:`) ? id.slice(`p${NET.pid}:`.length) : id);
