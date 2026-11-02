import { emit } from '../core/events';
import { log } from '../core/log';
import type { GameState } from '../core/types';

export interface AchievementDef { id: string; name: string; desc: string; check: (s: GameState) => boolean }

const totalUnits = (s: GameState) => s.games.reduce((a, g) => a + g.units, 0);

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: 'first', name: 'Premier pas', desc: 'Sortir votre premier jeu.', check: s => s.games.length >= 1 },
  { id: 'five', name: 'Catalogue', desc: 'Sortir 5 jeux.', check: s => s.games.length >= 5 },
  { id: 'twenty', name: 'Usine à jeux', desc: 'Sortir 20 jeux.', check: s => s.games.length >= 20 },
  { id: 'nine', name: 'Coup de maître', desc: 'Obtenir une note moyenne de 9 ou plus.', check: s => s.games.some(g => g.score >= 9) },
  { id: 'perfect', name: 'Perfection', desc: 'Obtenir 10/10 auprès des quatre critiques.', check: s => s.games.some(g => g.reviews.every(r => r === 10)) },
  { id: 'million', name: 'Millionnaire', desc: 'Avoir 1 M$ en caisse.', check: s => s.money >= 1e6 },
  { id: 'tycoon', name: 'Magnat', desc: 'Avoir 50 M$ en caisse.', check: s => s.money >= 5e7 },
  { id: 'copies', name: 'Disque d’or', desc: 'Vendre 1 million de copies au total.', check: s => totalUnits(s) >= 1e6 },
  { id: 'number1', name: 'Numéro un', desc: 'Être n°1 du classement hebdomadaire.', check: s => s.market.chart[0]?.kind === 'player' },
  { id: 'trophy', name: 'Sur le podium', desc: 'Remporter un trophée de fin d’année.', check: s => s.market.awards.some(a => a.player) },
  { id: 'goty', name: 'Jeu de l’année', desc: 'Remporter le trophée du jeu de l’année.', check: s => s.market.awards.some(a => a.player && a.title === 'Jeu de l’année') },
  { id: 'team', name: 'Grande équipe', desc: 'Employer 20 personnes.', check: s => s.employees.length >= 20 },
  { id: 'engine', name: 'Motoriste', desc: 'Construire votre propre moteur.', check: s => s.engines.length >= 2 },
  { id: 'console', name: 'Constructeur', desc: 'Lancer votre propre console.', check: s => s.consoles.some(c => c.phase !== 'dev') },
  { id: 'mmo', name: 'Monde persistant', desc: 'Atteindre 100 000 joueurs sur un jeu en ligne.', check: s => s.live.some(l => l.peak >= 100000) },
  { id: 'takeover', name: 'Prédateur', desc: 'Racheter entièrement un studio concurrent.', check: s => Object.values(s.shares).some(p => p >= 100) },
  { id: 'fans', name: 'Culte', desc: 'Réunir 1 million de fans.', check: s => s.fans >= 1e6 },
];

export function checkAchievements(s: GameState): string[] {
  const got: string[] = [];
  for (const a of ACHIEVEMENTS) {
    if (s.achievements.includes(a.id) || !a.check(s)) continue;
    s.achievements.push(a.id);
    got.push(a.id);
    log(s, `Succès débloqué : ${a.name}.`);
    emit('achievement', { id: a.id, name: a.name });
  }
  return got;
}
