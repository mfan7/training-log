import { useLiveQuery } from 'dexie-react-hooks';
import { db } from './db';

/** User-adjustable training defaults. Kept on this device (meta table), not synced. */
export interface Settings {
  /** rest between sets, seconds, for exercises added to a plan or a workout */
  rest: number;
  /** true: every exercise rests `rest` seconds during a workout, whatever its plan says */
  uniformRest: boolean;
  sets: number; repMin: number; repMax: number;
  /** heaviest home dumbbell, lb each; suggestions switch to more reps above it */
  homeDbMax: number;
}

export const DEFAULTS: Settings = { rest: 60, uniformRest: false, sets: 3, repMin: 8, repMax: 12, homeDbMax: 45 };

const KEY = 'settings';
const read = async (): Promise<Settings> => ({ ...DEFAULTS, ...((await db.meta.get(KEY))?.v as Partial<Settings> | undefined) });

export const getSettings = read;
export const useSettings = (): Settings => useLiveQuery(read, []) ?? DEFAULTS;
export async function saveSettings(patch: Partial<Settings>) {
  await db.meta.put({ k: KEY, v: { ...(await read()), ...patch } });
}
