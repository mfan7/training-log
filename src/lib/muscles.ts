import type { Muscle } from 'react-body-highlighter';
import { db } from './db';
import { ex, GROUP_ORDER } from './data';
import type { Exercise, SetRow } from './types';

// ---------- which muscles an exercise works ----------

// Matched in order against the exercise's muscle text; a matched word is removed, so
// "臀中肌" counts as abductors and not also as gluteal.
const WORDS: [string, Muscle[]][] = [
  ['股四头', ['quadriceps']], ['腘绳', ['hamstring']], ['腿后', ['hamstring']], ['臀中', ['abductors']],
  ['大腿外侧', ['abductors']], ['内收', ['adductor']], ['大腿内侧', ['adductor']], ['臀', ['gluteal']],
  ['小腿', ['calves']], ['踝', ['calves']], ['髋屈', ['quadriceps']],
  ['背阔', ['upper-back']], ['中背', ['upper-back']], ['上背', ['upper-back', 'trapezius']], ['斜方', ['trapezius']],
  ['竖脊', ['lower-back']], ['下背', ['lower-back']], ['背', ['upper-back']],
  ['前束', ['front-deltoids']], ['后束', ['back-deltoids']], ['肩袖', ['back-deltoids']],
  ['三角肌', ['front-deltoids', 'back-deltoids']], ['肩', ['front-deltoids', 'back-deltoids']],
  ['胸', ['chest']], ['二头', ['biceps']], ['肱桡', ['forearm']], ['握力', ['forearm']], ['腕', ['forearm']], ['手臂', ['biceps', 'triceps']],
  ['三头', ['triceps']], ['腹斜', ['obliques']], ['抗旋', ['obliques']], ['腹', ['abs']], ['核心', ['abs']],
  ['腿', ['quadriceps', 'hamstring', 'gluteal']],
];

/** The region a muscle group stands for, and what it lights up when the text names nothing in it. */
const GROUP: Record<string, { family: Muscle[]; fallback: Muscle[] }> = {
  腿: { family: ['quadriceps', 'hamstring', 'gluteal', 'adductor', 'abductors', 'calves'], fallback: ['quadriceps', 'hamstring', 'gluteal'] },
  胸: { family: ['chest'], fallback: ['chest'] },
  背: { family: ['upper-back', 'trapezius', 'lower-back'], fallback: ['upper-back'] },
  肩: { family: ['front-deltoids', 'back-deltoids'], fallback: ['front-deltoids', 'back-deltoids'] },
  二头: { family: ['biceps', 'forearm'], fallback: ['biceps'] },
  三头: { family: ['triceps'], fallback: ['triceps'] },
  核心: { family: ['abs', 'obliques', 'lower-back'], fallback: ['abs'] },
  全身: { family: [], fallback: ['quadriceps', 'gluteal', 'upper-back', 'abs'] },
  平衡: { family: [], fallback: ['gluteal', 'abductors'] },
  热身: { family: [], fallback: [] },
};

function fromText(text: string): Muscle[] {
  const out = new Set<Muscle>();
  let rest = text;
  for (const [w, ms] of WORDS) {
    if (!rest.includes(w)) continue;
    ms.forEach((m) => out.add(m));
    rest = rest.split(w).join(' ');
  }
  return [...out];
}

/** Primary muscles come from the exercise's group; others its description names are secondary. */
export function musclesOf(e: Exercise): { primary: Muscle[]; secondary: Muscle[] } {
  const named = fromText(e.muscles);
  const g = GROUP[e.group] ?? { family: [], fallback: [] };
  const inFamily = g.family.length ? named.filter((m) => g.family.includes(m)) : [];
  // 全身 / 平衡 have no single region: everything named counts as primary
  const primary = g.family.length ? (inFamily.length ? inFamily : g.fallback) : (named.length ? named : g.fallback);
  return { primary, secondary: named.filter((m) => !primary.includes(m)) };
}

/** Muscle groups worked, for the "练到" line: 胸 · 三头 · 核心. */
export function groupsWorked(ids: string[]): string[] {
  const gs = new Set(ids.map((id) => ex(id).group).filter((g) => g && g !== '热身'));
  return GROUP_ORDER.filter((g) => gs.has(g));
}

export const MUSCLE_NAME: Record<string, string> = {
  chest: '胸', 'front-deltoids': '肩前束', 'back-deltoids': '肩后束', biceps: '二头', triceps: '三头', forearm: '前臂',
  abs: '腹肌', obliques: '腹斜肌', trapezius: '斜方肌', 'upper-back': '背阔 / 中背', 'lower-back': '下背',
  quadriceps: '股四头', hamstring: '腘绳肌', gluteal: '臀', adductor: '大腿内侧', abductors: '大腿外侧 / 臀中', calves: '小腿',
};

// ---------- how hard a set was, against your own best ----------

/**
 * One number per set that grows with strength, so different weight × rep combinations compare:
 * weight → estimated one-rep max (Epley), bodyweight → reps (any added load beats none),
 * timed → seconds, assisted → less assistance and more reps.
 */
export function setScore(e: Exercise, s: Pick<SetRow, 'weight' | 'reps'>): number {
  const w = s.weight ?? 0;
  if (e.load === 'sec') return s.reps;
  if (e.load === 'level') return Math.max(1, 21 - w) * (1 + s.reps / 30);
  if (e.load === 'bw') return w > 0 ? 1000 + w * (1 + s.reps / 30) : s.reps;
  return w > 0 ? w * (1 + s.reps / 30) : s.reps / 100; // weighted lift logged at 0 lb barely counts
}

export type Level = 'pr' | 'high' | 'mid' | 'low' | 'first';
export const LEVEL_LABEL: Record<Level, string> = {
  pr: '新纪录', high: '接近最佳', mid: '中等', low: '轻松', first: '首次',
};
const levelOf = (ratio: number | null): Level =>
  ratio === null ? 'first' : ratio > 1.0001 ? 'pr' : ratio >= 0.9 ? 'high' : ratio >= 0.7 ? 'mid' : 'low';

export interface ExerciseResult {
  exId: string; sets: SetRow[];
  level: Level;
  /** best set before this session, and the change from the last time it was done */
  best: SetRow | null; trend: 'up' | 'down' | 'same' | null;
}

/** Rate each exercise of a session against your history before it (discarded sessions excluded). */
export async function rateSession(sessionId: string, sets: SetRow[]): Promise<ExerciseResult[]> {
  const byEx = new Map<string, SetRow[]>();
  for (const r of sets) byEx.set(r.exercise_id, [...(byEx.get(r.exercise_id) ?? []), r]);
  const live = new Set((await db.sessions.filter((s) => !s.deleted).toArray()).map((s) => s.id));
  const out: ExerciseResult[] = [];
  for (const [exId, mine] of byEx) {
    const e = ex(exId);
    const first = mine.reduce((m, r) => (r.done_at < m ? r.done_at : m), mine[0].done_at);
    const before = await db.sets.where('exercise_id').equals(exId)
      .filter((r) => !r.deleted && r.session_id !== sessionId && r.done_at < first && live.has(r.session_id)).toArray();
    const now = Math.max(...mine.map((r) => setScore(e, r)));
    let best: SetRow | null = null;
    for (const r of before) if (!best || setScore(e, r) > setScore(e, best)) best = r;
    // last time = the most recent earlier session that did this exercise
    const lastSid = before.reduce<SetRow | null>((m, r) => (!m || r.done_at > m.done_at ? r : m), null)?.session_id;
    const lastScore = lastSid ? Math.max(...before.filter((r) => r.session_id === lastSid).map((r) => setScore(e, r))) : null;
    out.push({
      exId, sets: mine,
      level: levelOf(best ? now / setScore(e, best) : null),
      best,
      trend: lastScore === null ? null : now > lastScore * 1.0001 ? 'up' : now < lastScore * 0.9999 ? 'down' : 'same',
    });
  }
  return out;
}

/** Effective sets per muscle: a set counts 1 for its primary muscles, 0.5 for secondary ones. Warm-ups don't count. */
export function muscleVolume(sets: Pick<SetRow, 'exercise_id' | 'reps'>[]) {
  const map = new Map<Muscle, { sets: number; exercises: Map<string, { sets: number; primary: boolean }> }>();
  for (const r of sets) {
    const e = ex(r.exercise_id);
    if (e.group === '热身' || r.reps <= 0) continue;
    const { primary, secondary } = musclesOf(e);
    for (const [list, w] of [[primary, 1], [secondary, 0.5]] as const) {
      for (const m of list) {
        const cur = map.get(m) ?? { sets: 0, exercises: new Map() };
        cur.sets += w;
        const x = cur.exercises.get(e.id) ?? { sets: 0, primary: w === 1 };
        x.sets += 1;
        cur.exercises.set(e.id, x);
        map.set(m, cur);
      }
    }
  }
  return map;
}

/** Weekly-sets bands: under 5 little, 5–10, 10–20 the usual target, over 20 a lot. */
export const VOL_BANDS = [
  { max: 5, fill: 'var(--vol-1)', label: '少于 5 组' },
  { max: 10, fill: 'var(--vol-2)', label: '5–10 组' },
  { max: 20, fill: 'var(--vol-3)', label: '10–20 组' },
  { max: Infinity, fill: 'var(--vol-4)', label: '20 组以上' },
] as const;
export const volumeFill = (weeklySets: number) => VOL_BANDS.find((b) => weeklySets < b.max)!.fill;

/** "15 lb × 10 × 4, 20 lb × 8": identical sets in a row collapse. */
export function compactSets(parts: string[]): string {
  const out: [string, number][] = [];
  for (const p of parts) {
    const last = out[out.length - 1];
    if (last && last[0] === p) last[1]++; else out.push([p, 1]);
  }
  return out.map(([p, n]) => (n > 1 ? `${p} × ${n}` : p)).join('，');
}
