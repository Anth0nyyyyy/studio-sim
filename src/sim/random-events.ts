import { emit } from '../core/events';
import { book } from '../core/ledger';
import { log } from '../core/log';
import { START_YEAR, monthIndex } from '../core/time';
import type { GameState } from '../core/types';
import { clamp, money, pick } from '../core/util';
import { fire } from './employees';

const yearFactor = (s: GameState) => 1 + (START_YEAR + Math.floor(monthIndex(s.time) / 12) - START_YEAR) * 0.08;
const k = (s: GameState, v: number) => Math.round((v * yearFactor(s)) / 500) * 500;

export interface EventChoice { label: string; apply: (s: GameState, target: number | null) => string }
export interface EventDef {
  id: string;
  title: string;
  text: (s: GameState, target: number | null) => string;
  /** Conditions d'apparition ; peut choisir une cible (employé, jeu…). */
  pickTarget?: (s: GameState) => number | null | undefined;
  when?: (s: GameState) => boolean;
  choices: (s: GameState, target: number | null) => EventChoice[];
}

const emp = (s: GameState, id: number | null) => s.employees.find(e => e.id === id);
const lastGame = (s: GameState) => s.games[0];

export const EVENTS: EventDef[] = [
  {
    id: 'raise',
    title: 'Demande d’augmentation',
    pickTarget: s => (s.employees.length ? pick(s.employees).id : undefined),
    text: (s, t) => `${emp(s, t)?.name} estime mériter une augmentation de 20 % et menace d’aller voir ailleurs.`,
    choices: (s, t) => [
      { label: `Accepter (+${money(Math.round((emp(s, t)?.salary ?? 0) * 0.2))}/mois)`, apply: (s2, t2) => {
        const e = emp(s2, t2); if (!e) return 'Trop tard, la personne est partie.';
        e.salary = Math.round(e.salary * 1.2 / 50) * 50; e.motivation = clamp(e.motivation + 25, 0, 100);
        return `${e.name} est ravi·e et redouble d’efforts.`;
      } },
      { label: 'Refuser', apply: (s2, t2) => {
        const e = emp(s2, t2); if (!e) return '';
        if (Math.random() < 0.3) { fire(s2, e.id); return `${e.name} a démissionné.`; }
        e.motivation = clamp(e.motivation - 25, 0, 100);
        return `${e.name} reste, mais la motivation s’en ressent.`;
      } },
    ],
  },
  {
    id: 'press',
    title: 'Reportage télé',
    when: s => !!s.project,
    text: s => `Une chaîne de télévision veut filmer l’équipe en train de créer ${s.project?.name}. Le tournage dérangera un peu le travail.`,
    choices: () => [
      { label: 'Ouvrir les portes', apply: s => { if (s.project) { s.project.hype += 30; s.project.progress = Math.max(0, s.project.progress - s.project.target * 0.05); } return 'Le reportage fait parler du jeu : +30 hype.'; } },
      { label: 'Décliner poliment', apply: () => 'L’équipe reste concentrée.' },
    ],
  },
  {
    id: 'leak',
    title: 'Fuite sur internet',
    when: s => !!s.project && monthIndex(s.time) >= 12 * 14,
    text: s => `Une version de travail de ${s.project?.name} circule en ligne. Les joueurs découvrent un jeu inachevé.`,
    choices: s => [
      { label: `Engager des avocats (${money(k(s, 20000))})`, apply: s2 => { book(s2, 'pénalités', -k(s2, 20000)); return 'La fuite est vite retirée.'; } },
      { label: 'Communiquer avec humour', apply: s2 => { if (s2.project) s2.project.hype += Math.random() < 0.5 ? 25 : -15; return 'La réaction du public est imprévisible…'; } },
    ],
  },
  {
    id: 'virus',
    title: 'Virus informatique',
    when: s => !!s.project && s.project.phase <= 2,
    text: () => 'Un virus s’est glissé sur les postes de l’équipe. Le code du projet est peut-être corrompu.',
    choices: s => [
      { label: `Acheter un antivirus pro (${money(k(s, 8000))})`, apply: s2 => { book(s2, 'construction', -k(s2, 8000)); return 'Le virus est éliminé sans dégâts.'; } },
      { label: 'Nettoyer à la main', apply: s2 => { if (s2.project) s2.project.bugs += 15; return 'Le nettoyage laisse des traces : +15 bugs.'; } },
    ],
  },
  {
    id: 'heatwave',
    title: 'Canicule',
    when: s => s.employees.length >= 2 && !s.furniture.some(f => f.type === 'clim') && monthIndex(s.time) % 12 >= 5 && monthIndex(s.time) % 12 <= 7,
    text: () => 'Il fait 38 °C dans les bureaux et aucun climatiseur n’est installé.',
    choices: () => [
      { label: 'Offrir des glaces et des ventilateurs (1 000 $)', apply: s => { book(s, 'construction', -1000); s.employees.forEach(e => (e.motivation = clamp(e.motivation + 5, 0, 100))); return 'L’équipe apprécie le geste.'; } },
      { label: 'Tenir bon', apply: s => { s.employees.forEach(e => { e.motivation = clamp(e.motivation - 20, 0, 100); e.fatigue = clamp(e.fatigue + 30, 0, 100); }); return 'La motivation fond avec la chaleur.'; } },
    ],
  },
  {
    id: 'jam',
    title: 'Game jam',
    when: s => s.employees.length >= 2,
    text: () => 'Une game jam de 48 heures est organisée en ville. L’équipe aimerait y participer.',
    choices: s => [
      { label: `Envoyer l’équipe (${money(k(s, 3000))})`, apply: s2 => {
        book(s2, 'marketing', -k(s2, 3000));
        for (const e of s2.employees) e.skills[e.spec] = Math.min(100, e.skills[e.spec] + 3);
        return 'Chacun progresse de 3 points dans sa spécialité.';
      } },
      { label: 'Pas cette fois', apply: () => 'Une autre fois peut-être.' },
    ],
  },
  {
    id: 'controversy',
    title: 'Polémique',
    when: s => !!lastGame(s) && ['Zombies', 'Horreur', 'Mafia', 'Militaire', 'Post-apo'].includes(lastGame(s).topic),
    text: s => `Une association accuse ${lastGame(s)?.name ?? "votre dernier jeu"} d’être trop violent. Les médias s’emparent de l’affaire.`,
    choices: () => [
      { label: 'Présenter des excuses', apply: s => { s.fans *= 0.98; return 'L’affaire se tasse, quelques fans sont déçus.'; } },
      { label: 'Assumer et provoquer', apply: s => {
        const g = lastGame(s);
        if (g && g.si < g.sched.length) for (let i = g.si; i < g.sched.length; i++) g.sched[i] *= 1.15;
        s.fans *= 0.97;
        return 'Le scandale fait vendre : +15 % de ventes, mais l’image du studio en pâtit.';
      } },
    ],
  },
  {
    id: 'fan',
    title: 'Fan-club',
    when: s => s.fans > 2000,
    text: () => 'Des fans proposent d’organiser une convention dédiée à vos jeux.',
    choices: s => [
      { label: `La financer (${money(k(s, 10000))})`, apply: s2 => { book(s2, 'marketing', -k(s2, 10000)); s2.fans *= 1.06; return 'La convention est un succès : +6 % de fans.'; } },
      { label: 'Les remercier', apply: s2 => { s2.fans *= 1.01; return 'Les fans organisent une petite rencontre de leur côté.'; } },
    ],
  },
  {
    id: 'blackout',
    title: 'Panne de courant',
    when: s => !!s.project && s.project.phase <= 2,
    text: () => 'Une panne générale a coupé les ordinateurs pendant la nuit. Le travail non sauvegardé est perdu.',
    choices: s => [
      { label: `Louer un groupe électrogène (${money(k(s, 5000))})`, apply: s2 => { book(s2, 'construction', -k(s2, 5000)); return 'Le travail reprend sans perte.'; } },
      { label: 'Accepter la perte', apply: s2 => { const p = s2.project; if (p) p.progress = Math.max(0, p.progress - p.target * 0.15); return 'Le projet recule de 15 % sur la phase en cours.'; } },
    ],
  },
  {
    id: 'investor',
    title: 'Proposition d’un investisseur',
    when: s => s.money < 60000,
    text: s => `Un investisseur propose ${money(k(s, 100000))} contre une part de vos futurs bénéfices (5 % de vos fans iront voir ailleurs, choqués par ce virage commercial).`,
    choices: s => [
      { label: `Accepter (${money(k(s, 100000))})`, apply: s2 => { book(s2, 'crédit reçu', k(s2, 100000)); s2.fans *= 0.95; return 'L’argent arrive, la communauté grogne.'; } },
      { label: 'Refuser', apply: () => 'Vous gardez votre indépendance.' },
    ],
  },
];

export const EVENT_BY_ID: Record<string, EventDef> = Object.fromEntries(EVENTS.map(e => [e.id, e]));
export const EVENT_CHANCE = 0.3;

/** Tirage mensuel d'un événement. */
export function rollEvent(s: GameState, rand = Math.random()): boolean {
  if (s.pendingEvent || s.status !== 'playing' && s.status !== 'sandbox' || rand > EVENT_CHANCE) return false;
  const pool = EVENTS.filter(e => !e.when || e.when(s));
  if (!pool.length) return false;
  const ev = pick(pool);
  const target = ev.pickTarget ? ev.pickTarget(s) : null;
  if (target === undefined) return false;
  s.pendingEvent = { id: ev.id, target };
  emit('event', undefined);
  return true;
}

export function resolveEvent(s: GameState, choice: number): string {
  const p = s.pendingEvent;
  if (!p) return '';
  s.pendingEvent = null;
  const ev = EVENT_BY_ID[p.id];
  const c = ev?.choices(s, p.target)[choice];
  if (!c) return '';
  const msg = c.apply(s, p.target);
  if (msg) log(s, `${ev.title} : ${msg}`);
  return msg;
}
