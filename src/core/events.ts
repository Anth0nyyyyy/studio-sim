import type { Game } from './types';

export interface Events {
  /** Une phase se termine : le joueur doit régler les curseurs de la suivante. */
  sliders: void;
  /** Un jeu vient de sortir. */
  released: { game: Game; notes: string[]; insight: string };
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
