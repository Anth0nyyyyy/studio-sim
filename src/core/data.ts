import roomsJson from '../data/rooms.json';
import furnJson from '../data/furniture.json';
import namesJson from '../data/names.json';
import type { FurnDef, RoomDef } from './types';

export const ROOM_LIST = roomsJson as RoomDef[];
export const FURN_LIST = furnJson as FurnDef[];
export const ROOMS: Record<string, RoomDef> = Object.fromEntries(ROOM_LIST.map(r => [r.id, r]));
export const FURN: Record<string, FurnDef> = Object.fromEntries(FURN_LIST.map(f => [f.id, f]));
export const NAMES = namesJson as { first: string[]; last: string[] };

export const OUTPUT_LABEL: Record<string, string> = {
  dev: 'Dev', graph: 'Graphismes', son: 'Son', qa: 'Tests', rp: 'Recherche', hype: 'Hype', hw: 'Hardware',
};

export const isWorkRoom = (type: string) => !!ROOMS[type]?.skills;
