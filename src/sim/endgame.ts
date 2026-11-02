import { emit } from '../core/events';
import { log } from '../core/log';
import { START_YEAR, monthIndex } from '../core/time';
import type { GameState } from '../core/types';
import { money } from '../core/util';
import { debt } from './business';

export const END_YEAR = 2013;
export const BANKRUPT_MONTHS = 3;

export const isOver = (s: GameState) => s.status === 'bankrupt' || s.status === 'ended';

/** Contrôle mensuel : faillite après 3 mois dans le rouge, fin de carrière en 2013. */
export function monthlyEndgame(s: GameState) {
  if (s.money < 0) {
    s.negMonths++;
    if (s.negMonths < BANKRUPT_MONTHS) log(s, `Attention : trésorerie négative depuis ${s.negMonths} mois. Faillite au bout de ${BANKRUPT_MONTHS}.`);
  } else s.negMonths = 0;
  if (s.negMonths >= BANKRUPT_MONTHS && s.status !== 'bankrupt') {
    s.status = 'bankrupt';
    log(s, 'La banque ferme le studio.');
    emit('gameover', { reason: 'bankrupt' });
    return;
  }
  const y = START_YEAR + Math.floor(monthIndex(s.time) / 12);
  if (y >= END_YEAR && s.status === 'playing') {
    s.status = 'ended';
    emit('gameover', { reason: 'ended' });
  }
}

export interface CareerScore { total: number; lines: [string, string, number][] }

export function careerScore(s: GameState): CareerScore {
  const units = s.games.reduce((a, g) => a + g.units, 0);
  const avg = s.games.length ? s.games.reduce((a, g) => a + g.score, 0) / s.games.length : 0;
  const trophies = s.market.awards.filter(a => a.player).length;
  const net = s.money - debt(s);
  const lines: [string, string, number][] = [
    ['Trésorerie nette', money(net), Math.max(0, Math.round(net / 10000))],
    ['Copies vendues', units.toLocaleString('fr-FR'), Math.round(units / 10000)],
    ['Note moyenne', avg.toFixed(1), Math.round(avg * 50)],
    ['Trophées', String(trophies), trophies * 100],
    ['Fans', Math.round(s.fans).toLocaleString('fr-FR'), Math.round(s.fans / 5000)],
    ['Succès', `${s.achievements.length}`, s.achievements.length * 50],
  ];
  return { total: lines.reduce((a, l) => a + l[2], 0), lines };
}
