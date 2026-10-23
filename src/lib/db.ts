import Dexie, { type Table } from 'dexie';
import type { Session, SetRow } from './types';
import { requestSync } from './sync';

class TrainingDB extends Dexie {
  sessions!: Table<Session, string>;
  sets!: Table<SetRow, string>;
  meta!: Table<{ k: string; v: unknown }, string>;

  constructor() {
    super('training-log');
    this.version(1).stores({
      sessions: 'id, date, started_at, dirty',
      sets: 'id, session_id, exercise_id, done_at, dirty',
      meta: 'k',
    });
  }
}

export const db = new TrainingDB();
export const now = () => new Date().toISOString();
export const uid = () => crypto.randomUUID();
export const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export async function putSession(s: Omit<Session, 'updated_at' | 'dirty'>) {
  await db.sessions.put({ ...s, updated_at: now(), dirty: 1 });
  requestSync();
}

export async function putSet(r: Omit<SetRow, 'updated_at' | 'dirty'>) {
  await db.sets.put({ ...r, updated_at: now(), dirty: 1 });
  requestSync();
}

export async function getMeta<T>(k: string, fallback: T): Promise<T> {
  const row = await db.meta.get(k);
  return row ? (row.v as T) : fallback;
}
export const setMeta = (k: string, v: unknown) => db.meta.put({ k, v });

/** All non-deleted sets of the most recent finished-or-current session that used this exercise, excluding `excludeSession`. */
export async function lastSetsFor(exerciseId: string, excludeSession?: string): Promise<SetRow[]> {
  const rows = await db.sets.where('exercise_id').equals(exerciseId).filter((r) => !r.deleted && r.session_id !== excludeSession).toArray();
  if (!rows.length) return [];
  rows.sort((a, b) => b.done_at.localeCompare(a.done_at));
  const sid = rows[0].session_id;
  return rows.filter((r) => r.session_id === sid).sort((a, b) => a.set_no - b.set_no);
}
