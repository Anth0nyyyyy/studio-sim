import { log } from '../core/log';
import { monthIndex, weekIndex } from '../core/time';
import type { GameState } from '../core/types';
import { money } from '../core/util';
import { genCandidate, updateEmployees } from './employees';
import { weeklySales } from './project';
import { marketWeek } from './market';
import { book } from '../core/ledger';
import { monthlyLicenses } from './research';
import { businessMonth, businessWeek } from './business';
import { liveMonthly, liveWeekly } from './live';

export const LOT_RENT = 3000;
export const CANDIDATES = 6;

export function monthlyCosts(s: GameState) {
  return LOT_RENT + s.employees.reduce((a, e) => a + e.salary, 0);
}

/** Avance la simulation de dt secondes simulées. Pas maximum conseillé : 0,25 s. */
export function tick(s: GameState, dt: number) {
  s.time += dt;
  updateEmployees(s, dt);

  const m = monthIndex(s.time);
  if (m > s.lastMonth) {
    s.lastMonth = m;
    const c = monthlyCosts(s);
    book(s, 'salaires', -(c - LOT_RENT));
    book(s, 'loyer', -LOT_RENT);
    log(s, `Salaires et loyer payés : ${money(c)}.`);
    monthlyLicenses(s);
    businessMonth(s);
    liveMonthly(s);
  }
  const w = weekIndex(s.time);
  if (w > s.lastWeek) {
    s.lastWeek = w;
    weeklySales(s);
    marketWeek(s);
    businessWeek(s);
    liveWeekly(s);
    s.candidates.splice(0, 3);
    while (s.candidates.length < CANDIDATES) s.candidates.push(genCandidate(s, 1 + Math.min(0.6, m / 120)));
  }
}
