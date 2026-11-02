import type { GameState } from './types';
import { dateLabel } from './time';

type Listener = (m: string) => void;
const listeners: Listener[] = [];
export const onLog = (fn: Listener) => listeners.push(fn);

export function log(s: GameState, m: string) {
  s.log.unshift({ t: dateLabel(s.time), m });
  if (s.log.length > 100) s.log.length = 100;
  listeners.forEach(fn => fn(m));
}
