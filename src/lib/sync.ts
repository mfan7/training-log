import { supabase } from './supabase';
import { db, getMeta, setMeta } from './db';
import type { Table } from 'dexie';
import type { Session, SetRow } from './types';

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

const strip = <T extends { dirty: 0 | 1 }>({ dirty: _d, ...rest }: T) => rest;

/** Mark pushed rows clean, unless they were edited again while the push was in flight. */
async function markClean<T extends { id: string; updated_at: string; dirty: 0 | 1 }>(table: AnyTable, rows: T[]) {
  await db.transaction('rw', table, async () => {
    for (const r of rows) {
      const cur = (await table.get(r.id)) as T | undefined;
      if (cur && cur.updated_at === r.updated_at) await table.update(r.id, { dirty: 0 });
    }
  });
}

/** Rows from the server win, except rows with unpushed local edits. */
async function merge<T extends { id: string; dirty: 0 | 1 }>(table: AnyTable, rows: Omit<T, 'dirty'>[]) {
  await db.transaction('rw', table, async () => {
    for (const r of rows) {
      const cur = (await table.get(r.id)) as T | undefined;
      if (!cur || cur.dirty === 0) await table.put({ ...r, dirty: 0 });
    }
  });
}

export async function sync(): Promise<void> {
  if (!supabase || running) return;
  const { data } = await supabase.auth.getSession();
  if (!data.session) { emit({ status: 'signed-out' }); return; }
  if (!navigator.onLine) { emit({ status: 'offline' }); return; }
  running = true;
  emit({ status: 'syncing' });
  try {
    // push: sessions before sets (foreign key)
    const ds = await db.sessions.where('dirty').equals(1).toArray();
    if (ds.length) {
      const { error } = await supabase.from('sessions').upsert(ds.map(strip));
      if (error) throw error;
      await markClean(db.sessions, ds);
    }
    const dr = await db.sets.where('dirty').equals(1).toArray();
    if (dr.length) {
      const { error } = await supabase.from('sets').upsert(dr.map(strip));
      if (error) throw error;
      await markClean(db.sets, dr);
    }

    // pull everything changed on the server since the last pull
    for (const name of ['sessions', 'sets'] as const) {
      const key = `pulled:${name}`;
      let since = await getMeta<string>(key, '1970-01-01T00:00:00Z');
      for (;;) {
        const { data: rows, error } = await supabase.from(name).select('*').gt('updated_at', since).order('updated_at').limit(1000);
        if (error) throw error;
        if (!rows?.length) break;
        const clean = rows.map(({ user_id: _u, ...r }: Record<string, unknown>) => r) as Record<string, any>[]; // eslint-disable-line @typescript-eslint/no-explicit-any
        if (name === 'sessions') await merge<Session>(db.sessions, clean as Omit<Session, 'dirty'>[]);
        else await merge<SetRow>(db.sets, clean.map((r) => ({ ...r, weight: r.weight === null ? null : Number(r.weight), rpe: r.rpe === null ? null : Number(r.rpe) })) as Omit<SetRow, 'dirty'>[]);
        since = rows[rows.length - 1].updated_at;
        await setMeta(key, since);
        if (rows.length < 1000) break;
      }
    }
    emit({ status: 'idle', at: new Date().toISOString() });
  } catch (e) {
    emit({ status: 'error', message: e instanceof Error ? e.message : String(e) });
  } finally {
    running = false;
  }
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
