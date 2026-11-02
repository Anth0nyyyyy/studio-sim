/** Secondes de simulation par jour de jeu (à vitesse x1, 1 s réelle = 1 s simulée). */
export const DAY_SEC = 6;
export const DAYS_PER_WEEK = 7;
export const DAYS_PER_MONTH = 28;
export const START_YEAR = 1980;

const MOIS = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sep', 'Oct', 'Nov', 'Déc'];
const JOURS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

export const dayIndex = (t: number) => Math.floor(t / DAY_SEC);
export const weekIndex = (t: number) => Math.floor(dayIndex(t) / DAYS_PER_WEEK);
export const monthIndex = (t: number) => Math.floor(dayIndex(t) / DAYS_PER_MONTH);

export function dateLabel(t: number): string {
  const d = dayIndex(t);
  const m = monthIndex(t);
  return `${JOURS[d % 7]} ${(d % DAYS_PER_MONTH) + 1} ${MOIS[m % 12]} ${START_YEAR + Math.floor(m / 12)}`;
}
