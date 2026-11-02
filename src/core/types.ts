export type Skill = 'design' | 'prog' | 'graph' | 'son' | 'tests' | 'recherche' | 'marketing' | 'hardware';
export const SKILLS: Skill[] = ['design', 'prog', 'graph', 'son', 'tests', 'recherche', 'marketing', 'hardware'];
export const SKILL_LABEL: Record<Skill, string> = {
  design: 'Game design', prog: 'Programmation', graph: 'Graphisme', son: 'Son',
  tests: 'Tests', recherche: 'Recherche', marketing: 'Marketing', hardware: 'Hardware',
};
export const SKILL_HUE: Record<Skill, number> = {
  design: 200, prog: 20, graph: 300, son: 120, tests: 45, recherche: 170, marketing: 350, hardware: 260,
};

export type NeedKind = 'hunger' | 'bladder' | 'fatigue';
export const NEED_LABEL: Record<NeedKind, string> = { hunger: 'Faim', bladder: 'Toilettes', fatigue: 'Fatigue' };

export interface RoomDef {
  id: string; name: string; color: string; costTile: number; min: [number, number];
  skills?: Skill[]; out?: string;
}
export interface FurnDef {
  id: string; name: string; cost: number; rooms: string[];
  use?: 'work' | NeedKind; comfort?: number; boost?: number; duration?: number;
}

export interface Room { id: number; type: string; x: number; y: number; w: number; h: number; cost: number }
export interface Furniture { id: number; type: string; x: number; y: number; room: number; owner: number | null; user: number | null }

export type EmpState = 'idle' | 'walking' | 'working' | 'using';
export type GoalKind = 'desk' | NeedKind | 'wander';

export interface Employee {
  id: number; name: string; spec: Skill; skills: Record<Skill, number>; salary: number;
  motivation: number; fatigue: number; hunger: number; bladder: number;
  x: number; y: number; path: [number, number][];
  state: EmpState; goal: GoalKind | null; using: number | null;
  room: number | null; desk: number | null;
  timer: number; missing: NeedKind | null; rate: number;
}

export interface LogEntry { t: string; m: string }

export type SizeId = 'S' | 'M' | 'L';
export type AreaType = 'D' | 'T';
export type EngineCat = 'graph' | 'son' | 'ctrl' | 'ia' | 'phys';
export const ENGINE_CATS: EngineCat[] = ['graph', 'son', 'ctrl', 'ia', 'phys'];
export interface GenreDef { id: string; color: string; design: number; graph: number; son: number; w: number[][]; engine: Record<EngineCat, number> }
export interface ResearchDef {
  id: string; name: string; group: string; year: number; rp: number; money: number; req: string[];
  cat?: EngineCat; value?: number; base?: boolean; desc?: string; topics?: string[];
}
export interface Engine {
  id: number; name: string; features: Record<EngineCat, string>;
  tech: number; cost: number; readyAt: number; licensed: boolean; licenseIncome: number;
}
export interface TopicDef { name: string; combo: string; aud: string }
export interface PlatformDef { id: string; name: string; from: number; to: number; market: number; license: number; likes: string[]; dislikes: string[] }
export interface SizeDef { name: string; target: number; cost: number; units: number; price: number; minStaff: number; weeks: number }
export interface AudienceDef { id: string; name: string; market: number }

export interface ProjectSpec {
  name: string; topic: string; genre: string; sub: string | null;
  audience: string; size: SizeId; platforms: string[]; engine: number;
}
export interface Project extends ProjectSpec {
  cost: number;
  /** 0..2 = phases de contenu, 3 = polissage */
  phase: number;
  progress: number; target: number;
  sliders: number[][]; wait: boolean;
  areas: number[][];
  design: number; tech: number; graph: number; son: number; bugs: number; hype: number;
  startedAt: number;
}
export interface Game extends ProjectSpec {
  id: number; score: number; reviews: number[]; quality: number;
  units: number; revenue: number; cost: number;
  sched: number[]; si: number; releasedAt: number;
}

export interface GameState {
  version: number;
  W: number; H: number;
  lot: { x0: number; y0: number; x1: number; y1: number };
  entrance: [number, number];
  /** -1 hors terrain, 0 couloir, >0 id de salle */
  roomMap: number[];
  rooms: Room[];
  furniture: Furniture[];
  doors: string[];
  employees: Employee[];
  candidates: Employee[];
  money: number;
  time: number;
  nextId: number;
  output: Record<string, number>;
  log: LogEntry[];
  lastMonth: number;
  lastWeek: number;
  project: Project | null;
  games: Game[];
  fans: number;
  rp: number;
  /** Meilleure qualité atteinte (référence des critiques) */
  best: number;
  /** Importance des domaines découverte, par genre : "phase-area" */
  know: Record<string, string[]>;
  /** Combos sujet|genre déjà testés */
  combos: Record<string, string>;
  /** Recherches acquises */
  done: Record<string, true>;
  topics: string[];
  engines: Engine[];
}
