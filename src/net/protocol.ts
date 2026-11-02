import type { AwardResult, Market, PlatformDef } from '../core/types';

/** Identifiant de studio d'un joueur dans le monde partagé. */
export const playerStudio = (pid: number) => `p:${pid}`;
export const isPlayerStudio = (id: string) => id.startsWith('p:');
/** Identifiant global d'une console de joueur : "p3:own12". */
export const globalConsoleId = (pid: number, localId: string) => `p${pid}:${localId}`;
export const consoleOwner = (globalId: string) => {
  const m = /^p(\d+):own/.exec(globalId);
  return m ? +m[1] : null;
};
/** Les identifiants de jeux de joueurs sont rendus uniques dans le monde. */
export const GAME_ID_SPAN = 1_000_000;

export interface ReportGame {
  id: number; name: string; topic: string; genre: string; score: number;
  weekly: number; units: number; releasedAt: number; platforms: string[];
}
export interface ReportConsole { id: string; name: string; market: number; from: number; to: number }
export interface Report { games: ReportGame[]; consoles: ReportConsole[]; money: number; fans: number }

export interface PlayerInfo {
  pid: number; name: string; color: string; online: boolean;
  money: number; fans: number; games: number; value: number; vote: number;
  /** Parts détenues par chaque joueur dans ce studio (pid → %) */
  holders: Record<number, number>;
}

export interface SharedPlatform extends PlatformDef { owner: number }

export interface ChatLine { from: string; color: string; text: string; t: number; system?: boolean }

export type ClientMsg =
  | { type: 'hello'; token: string; name: string; color: string }
  | { type: 'speed'; v: number }
  | { type: 'report'; report: Report }
  | { type: 'chat'; text: string }
  | { type: 'buyShares'; target: number }
  | { type: 'sellShares'; target: number };

export type ServerMsg =
  | { type: 'welcome'; pid: number; time: number; speed: number }
  | { type: 'clock'; time: number; speed: number; pausedBy: string[] }
  | { type: 'market'; market: Market; platforms: SharedPlatform[] }
  | { type: 'players'; players: PlayerInfo[] }
  | { type: 'royalties'; amount: number; console: string }
  | { type: 'dividend'; amount: number; from: string }
  | { type: 'shares'; ok: boolean; target: number; pct: number; amount: number; error?: string }
  | { type: 'awards'; year: number; results: AwardResult[] }
  | { type: 'expo'; year: number }
  | { type: 'chat'; lines: ChatLine[] }
  | { type: 'error'; text: string };
