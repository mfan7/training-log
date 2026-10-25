import Dexie, { type Table } from 'dexie';
import type { CustomExercise, Session, SetRow, Template } from './types';
import { requestSync } from './sync';
import { seedTemplates } from './data';

class TrainingDB extends Dexie {
  sessions!: Table<Session, string>;
  sets!: Table<SetRow, string>;
  meta!: Table<{ k: string; v: unknown }, string>;
  templates!: Table<Template, string>;
  exercises!: Table<CustomExercise, string>;

  constructor() {
    super('training-log');
    this.version(1).stores({
      sessions: 'id, date, started_at, dirty',
      sets: 'id, session_id, exercise_id, done_at, dirty',
      meta: 'k',
    });
    this.version(2).stores({
      templates: 'id, dirty',
      exercises: 'id, dirty',
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

export async function putTemplate(t: Omit<Template, 'updated_at' | 'dirty'>) {
  await db.templates.put({ ...t, updated_at: now(), dirty: 1 });
  requestSync();
}

export async function putExercise(e: Omit<CustomExercise, 'updated_at' | 'dirty'>) {
  await db.exercises.put({ ...e, updated_at: now(), dirty: 1 });
  requestSync();
}

/** Add the shipped plans on a device that has never had them. Edited or deleted ones are left alone. */
export async function ensureSeeds() {
  await db.transaction('rw', db.templates, async () => {
    for (const t of seedTemplates()) if (!(await db.templates.get(t.id))) await db.templates.put(t);
  });
}

export async function getMeta<T>(k: string, fallback: T): Promise<T> {
  const row = await db.meta.get(k);
  return row ? (row.v as T) : fallback;
}
export const setMeta = (k: string, v: unknown) => db.meta.put({ k, v });

/**
 * All non-deleted sets of the most recent session that used this exercise, excluding `excludeSession`
 * and sessions that were discarded. With `before`, only sets done before that time count.
 */
export async function lastSetsFor(exerciseId: string, excludeSession?: string, before?: string): Promise<SetRow[]> {
  const rows = await db.sets.where('exercise_id').equals(exerciseId)
    .filter((r) => !r.deleted && r.session_id !== excludeSession && (!before || r.done_at < before)).toArray();
  rows.sort((a, b) => b.done_at.localeCompare(a.done_at));
  const checked = new Set<string>();
  for (const r of rows) {
    if (checked.has(r.session_id)) continue;
    checked.add(r.session_id);
    const s = await db.sessions.get(r.session_id);
    if (s && !s.deleted) return rows.filter((x) => x.session_id === r.session_id).sort((a, b) => a.set_no - b.set_no);
  }
  return [];
}
