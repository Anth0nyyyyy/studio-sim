import type { AwardResult, Game } from './types';

export interface Events {
  /** Une phase se termine : le joueur doit régler les curseurs de la suivante. */
  sliders: void;
  /** Un jeu vient de sortir. */
  released: { game: Game; notes: string[]; insight: string };
  /** Le salon annuel ouvre ses portes. */
  expo: { year: number };
  /** Remise des prix de fin d'année. */
  awards: { year: number; results: AwardResult[]; won: number };
  /** Un événement aléatoire demande une décision. */
  event: void;
  /** Un succès vient d'être débloqué. */
  achievement: { id: string; name: string };
  /** Faillite ou fin de carrière. */
  gameover: { reason: 'bankrupt' | 'ended' };
}

type AnyHandler = (p: unknown) => void;
const handlers = new Map<keyof Events, AnyHandler[]>();

export function on<K extends keyof Events>(k: K, fn: (p: Events[K]) => void) {
  const list = handlers.get(k) ?? [];
  list.push(fn as AnyHandler);
  handlers.set(k, list);
}
export function emit<K extends keyof Events>(k: K, p: Events[K]) {
  handlers.get(k)?.forEach(fn => fn(p));
}
