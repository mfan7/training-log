import { db } from './db';
import { ex, GROUP_ORDER } from './data';
import { conditioning, muscleVolume, setScore } from './muscles';
import type { Session, SetRow } from './types';

export type Range = 'week' | 'month' | 'quarter' | 'all';
export const RANGE_LABEL: Record<Range, string> = { week: '本周', month: '本月', quarter: '本季度', all: '全部' };

const DAY = 864e5;

/** Start of the range in local time; 'all' starts at the first session. */
function rangeStart(r: Range, firstSession: string | undefined, now = new Date()): Date {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (r === 'week') d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  else if (r === 'month') d.setDate(1);
  else if (r === 'quarter') d.setMonth(Math.floor(d.getMonth() / 3) * 3, 1);
  else return firstSession ? new Date(firstSession) : d;
  return d;
}

export interface ExerciseProgress {
  exId: string; sets: number;
  /** strongest set before the range (or the first session in it, if none before) → strongest set in the range */
  from: SetRow; to: SetRow; change: number | null;
  /** sessions in the range that beat everything before them */
  records: number;
}

export interface Progress {
  sessions: Session[]; weeks: number; records: number;
  volume: ReturnType<typeof muscleVolume>;
  fitness: ReturnType<typeof conditioning>;
  exercises: Map<string, ExerciseProgress>;
  groups: { group: string; perWeek: number; up: number; down: number }[];
}

export async function progressFor(r: Range, now = new Date()): Promise<Progress> {
  const all = (await db.sessions.filter((s) => !s.deleted).toArray()).sort((a, b) => a.started_at.localeCompare(b.started_at));
  const start = rangeStart(r, all[0]?.started_at, now).toISOString();
  const live = new Set(all.map((s) => s.id));
  const inRange = new Set(all.filter((s) => s.started_at >= start).map((s) => s.id));
  const sets = (await db.sets.filter((x) => !x.deleted && live.has(x.session_id)).toArray())
    .sort((a, b) => a.done_at.localeCompare(b.done_at));
  const mine = sets.filter((x) => inRange.has(x.session_id));
  // a partial period counts as the days so far, so 本月 on the 10th averages over 10 days
  const weeks = Math.max(1, (now.getTime() - Date.parse(start)) / (7 * DAY));

  const exercises = new Map<string, ExerciseProgress>();
  for (const exId of new Set(mine.map((x) => x.exercise_id))) {
    const e = ex(exId);
    if (e.group === '热身') continue;
    // best set of each session, oldest first
    const bySession = new Map<string, SetRow>();
    for (const x of sets) {
      if (x.exercise_id !== exId) continue;
      const cur = bySession.get(x.session_id);
      if (!cur || setScore(e, x) > setScore(e, cur)) bySession.set(x.session_id, x);
    }
    const tops = [...bySession.values()].sort((a, b) => a.done_at.localeCompare(b.done_at));
    let best: SetRow | null = null, before: SetRow | null = null, firstIn: SetRow | null = null, bestIn: SetRow | null = null;
    let records = 0;
    for (const t of tops) {
      const isIn = inRange.has(t.session_id);
      if (isIn) {
        if (best && setScore(e, t) > setScore(e, best)) records++;
        firstIn ??= t;
        if (!bestIn || setScore(e, t) > setScore(e, bestIn)) bestIn = t;
      } else if (!before || setScore(e, t) > setScore(e, before)) before = t;
      if (!best || setScore(e, t) > setScore(e, best)) best = t;
    }
    const from = before ?? firstIn!;
    const to = bestIn!;
    const comparable = before !== null || tops.filter((t) => inRange.has(t.session_id)).length > 1;
    exercises.set(exId, {
      exId, sets: mine.filter((x) => x.exercise_id === exId).length, from, to, records,
      change: comparable ? setScore(e, to) / setScore(e, from) - 1 : null,
    });
  }

  const groups = GROUP_ORDER.filter((g) => !['热身', '平衡', '全身'].includes(g)).map((g) => {
    const list = [...exercises.values()].filter((p) => ex(p.exId).group === g);
    return {
      group: g,
      perWeek: list.reduce((a, p) => a + p.sets, 0) / weeks,
      up: list.filter((p) => (p.change ?? 0) > 0.0001).length,
      down: list.filter((p) => (p.change ?? 0) < -0.0001).length,
    };
  });

  return {
    sessions: all.filter((s) => inRange.has(s.id)), weeks,
    records: [...exercises.values()].reduce((a, p) => a + p.records, 0),
    volume: muscleVolume(mine), fitness: conditioning(mine), exercises, groups,
  };
}
