import { supabase } from './supabase';
import { db, getMeta, setMeta } from './db';
import type { Table } from 'dexie';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyTable = Table<any, string>;

export type SyncState = { status: 'off' | 'signed-out' | 'idle' | 'syncing' | 'offline' | 'error'; message?: string; at?: string };

let state: SyncState = { status: supabase ? 'signed-out' : 'off' };
const listeners = new Set<(s: SyncState) => void>();
const emit = (s: SyncState) => { state = s; listeners.forEach((l) => l(s)); };
export const getSyncState = () => state;
export const onSyncState = (l: (s: SyncState) => void) => { listeners.add(l); return () => { listeners.delete(l); }; };

let timer: ReturnType<typeof setTimeout> | undefined;
let running = false;
export function requestSync(delay = 1000) {
  clearTimeout(timer);
  timer = setTimeout(() => { void sync(); }, delay);
}

/** Mark pushed rows clean, unless they were edited again while the push was in flight. */
async function markClean(table: AnyTable, rows: { id: string; updated_at: string }[]) {
  await db.transaction('rw', table, async () => {
    for (const r of rows) {
      const cur = await table.get(r.id);
      if (cur && cur.updated_at === r.updated_at) await table.update(r.id, { dirty: 0 });
    }
  });
}

/** Rows from the server win, except rows with unpushed local edits. */
async function merge(table: AnyTable, rows: Record<string, unknown>[]) {
  await db.transaction('rw', table, async () => {
    for (const r of rows) {
      const cur = await table.get(r.id as string);
      if (!cur || cur.dirty === 0) await table.put({ ...r, dirty: 0 });
    }
  });
}

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

/** Synced tables in push order (sets reference sessions). `up`/`down` convert between local and server rows. */
const TABLES: { name: string; local: () => AnyTable; up: (r: Row) => Row; down: (r: Row) => Row }[] = [
  {
    name: 'exercises', local: () => db.exercises,
    up: ({ id, deleted, updated_at, dirty: _d, ...data }) => ({ id, deleted, updated_at, data }),
    down: ({ id, deleted, updated_at, data }) => ({ ...data, id, deleted, updated_at, custom: true }),
  },
  { name: 'templates', local: () => db.templates, up: ({ dirty: _d, ...r }) => r, down: (r) => r },
  {
    // sessions saved before plans were editable lack these fields; a mixed batch would send them as null
    name: 'sessions', local: () => db.sessions,
    up: ({ dirty: _d, ...r }) => ({ ...r, template_id: r.template_id ?? null, title: r.title ?? '' }), down: (r) => r,
  },
  {
    name: 'sets', local: () => db.sets, up: ({ dirty: _d, ...r }) => r,
    down: (r) => ({ ...r, weight: r.weight === null ? null : Number(r.weight), rpe: r.rpe === null ? null : Number(r.rpe) }),
  },
];

async function syncTable({ name, local, up, down }: (typeof TABLES)[number]) {
  const sb = supabase!;
  const dirty = await local().where('dirty').equals(1).toArray();
  if (dirty.length) {
    const { error } = await sb.from(name).upsert(dirty.map(up));
    if (error) throw error;
    await markClean(local(), dirty);
  }
  // pull everything changed on the server since the last pull
  const key = `pulled:${name}`;
  let since = await getMeta<string>(key, '1970-01-01T00:00:00Z');
  for (;;) {
    const { data: rows, error } = await sb.from(name).select('*').gt('updated_at', since).order('updated_at').limit(1000);
    if (error) throw error;
    if (!rows?.length) break;
    await merge(local(), rows.map(({ user_id: _u, ...r }: Row) => down(r)));
    since = rows[rows.length - 1].updated_at;
    await setMeta(key, since);
    if (rows.length < 1000) break;
  }
}

export async function sync(): Promise<void> {
  if (!supabase || running) return;
  const { data } = await supabase.auth.getSession();
  if (!data.session) { emit({ status: 'signed-out' }); return; }
  if (!navigator.onLine) { emit({ status: 'offline' }); return; }
  running = true;
  emit({ status: 'syncing' });
  // Each table syncs on its own, so e.g. a missing new table on the server doesn't hold up workout data.
  const errors: string[] = [];
  for (const t of TABLES) {
    try { await syncTable(t); } catch (e) { errors.push(`${t.name}: ${e instanceof Error ? e.message : (e as { message?: string }).message ?? String(e)}`); }
  }
  emit(errors.length ? { status: 'error', message: errors.join('；') } : { status: 'idle', at: new Date().toISOString() });
  running = false;
}

export function startSyncLoop() {
  if (!supabase) return;
  supabase.auth.onAuthStateChange((_ev, session) => {
    if (session) requestSync(0); else emit({ status: 'signed-out' });
  });
  window.addEventListener('online', () => requestSync(0));
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') requestSync(0); });
  setInterval(() => requestSync(0), 5 * 60 * 1000);
}
