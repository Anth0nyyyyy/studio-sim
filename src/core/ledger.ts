import { monthIndex } from './time';
import type { GameState } from './types';

export type LedgerCat =
  | 'ventes' | 'licences' | 'trophées' | 'contrats' | 'édition' | 'dividendes' | 'crédit reçu' | 'ventes d’actions' | 'reventes'
  | 'salaires' | 'loyer' | 'production' | 'construction' | 'recherche' | 'développement' | 'marketing' | 'intérêts' | 'remboursements' | 'pénalités' | 'achats d’actions';

export const LEDGER_MONTHS = 24;

/** Mouvement d'argent comptabilisé dans le mois en cours (montant positif = recette). */
export function book(s: GameState, cat: LedgerCat, amount: number) {
  if (!amount) return;
  s.money += amount;
  const m = monthIndex(s.time);
  let row = s.ledger[0];
  if (!row || row.month !== m) {
    row = { month: m, lines: {} };
    s.ledger.unshift(row);
    if (s.ledger.length > LEDGER_MONTHS) s.ledger.length = LEDGER_MONTHS;
  }
  row.lines[cat] = (row.lines[cat] ?? 0) + amount;
}
