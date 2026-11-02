import roomsJson from '../data/rooms.json';
import furnJson from '../data/furniture.json';
import namesJson from '../data/names.json';
import genresJson from '../data/genres.json';
import topicsJson from '../data/topics.json';
import platformsJson from '../data/platforms.json';
import gameJson from '../data/game.json';
import researchJson from '../data/research.json';
import marketJson from '../data/market.json';
import businessJson from '../data/business.json';
import type { RivalDef, AreaType, AudienceDef, EngineCat, FurnDef, GenreDef, PlatformDef, ResearchDef, RoomDef, SizeDef, SizeId, TopicDef } from './types';

export const GENRES = genresJson as GenreDef[];
export const GENRE: Record<string, GenreDef> = Object.fromEntries(GENRES.map(g => [g.id, g]));
export const TOPICS = topicsJson as TopicDef[];
export const TOPIC: Record<string, TopicDef> = Object.fromEntries(TOPICS.map(t => [t.name, t]));
export const PLATFORMS = platformsJson as PlatformDef[];
export const PLATFORM: Record<string, PlatformDef> = Object.fromEntries(PLATFORMS.map(p => [p.id, p]));
export const PHASES = gameJson.phases as { name: string; areas: [string, AreaType][] }[];
export const SIZES = gameJson.sizes as Record<SizeId, SizeDef>;
export const AUDIENCES = gameJson.audiences as AudienceDef[];
export const SUB_GOOD = gameJson.subGood as [string, string][];
export const SUB_BAD = gameJson.subBad as [string, string][];
export const RESEARCH = researchJson as ResearchDef[];
export const RESEARCH_BY_ID: Record<string, ResearchDef> = Object.fromEntries(RESEARCH.map(r => [r.id, r]));
export const ENGINE_CAT_LABEL: Record<EngineCat, string> = { graph: 'Graphismes', son: 'Son', ctrl: 'Contrôles', ia: 'IA', phys: 'Physique' };
/** Sujets débloqués par la recherche ; les autres sont disponibles d'entrée. */
export const LOCKED_TOPICS = new Set(RESEARCH.flatMap(r => r.topics ?? []));
export const REVIEWERS = gameJson.reviewers;
export const VERDICTS = gameJson.verdicts;

export const ROOM_LIST = roomsJson as RoomDef[];
export const FURN_LIST = furnJson as FurnDef[];
export const ROOMS: Record<string, RoomDef> = Object.fromEntries(ROOM_LIST.map(r => [r.id, r]));
export const FURN: Record<string, FurnDef> = Object.fromEntries(FURN_LIST.map(f => [f.id, f]));
export const NAMES = namesJson as { first: string[]; last: string[] };

export const OUTPUT_LABEL: Record<string, string> = {
  dev: 'Dev', graph: 'Graphismes', son: 'Son', qa: 'Tests', rp: 'Recherche', hype: 'Hype', hw: 'Hardware',
};

export const isWorkRoom = (type: string) => !!ROOMS[type]?.skills;

export const RIVALS = marketJson.rivals as RivalDef[];
export const RIVAL: Record<string, RivalDef> = Object.fromEntries(RIVALS.map(r => [r.id, r]));
export const EXPO = marketJson.expo;
export const AWARDS = marketJson.awards;
export const TREND_WEEKS = marketJson.trendWeeks;
export const RIVAL_NAME_A = marketJson.nameA;
export const RIVAL_NAME_B = marketJson.nameB;

export const BUSINESS = businessJson as typeof businessJson & { contractKinds: Record<string, { label: string; rate: number }> };
