import type { Exercise, Loc, PlanItem, Session, SetRow, Week } from './types';

const NEXT: Record<Week, Week> = { A: 'B', B: 'C', C: 'A' };

/** Monday-based week key, local time. */
function weekKey(d: Date): string {
  const m = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  m.setDate(m.getDate() - ((m.getDay() + 6) % 7));
  return `${m.getFullYear()}-${m.getMonth()}-${m.getDate()}`;
}

/**
 * Rotation: stay on the last session's week while still in the same calendar week,
 * otherwise move to the next letter. Missed weeks don't skip letters.
 */
export function currentWeek(sessions: Session[], at = new Date()): Week {
  const done = sessions.filter((s) => !s.deleted).sort((a, b) => b.started_at.localeCompare(a.started_at));
  if (!done.length) return 'A';
  const last = done[0];
  return weekKey(new Date(last.started_at)) === weekKey(at) ? last.week : NEXT[last.week];
}

export const HOME_DB_MAX = 45; // adjustable dumbbells, lb each

export interface Suggestion { weight: number | null; reps: number; note: string }

/** Double progression: hit the top of the rep range on every set → add load next time. */
export function suggest(e: Exercise, item: PlanItem, last: SetRow[], loc: Loc): Suggestion {
  const unit = e.load === 'sec' ? '秒' : '次';
  if (!last.length) {
    if (e.load === 'level') return { weight: null, reps: item.min, note: `第一次：选一个能做 ${item.max} 次但很吃力的档位` };
    if (e.load === 'lb') return { weight: null, reps: item.min, note: `第一次：选一个能做 ${item.max} 次但很吃力的重量` };
    return { weight: null, reps: item.min, note: `第一次：目标 ${item.min}–${item.max} ${unit}` };
  }
  const allHit = last.length >= item.sets && last.every((s) => s.reps >= item.max);
  const bestReps = Math.max(...last.map((s) => s.reps));

  if (e.load === 'level') {
    const lvl = Math.min(...last.map((s) => s.weight ?? 99));
    return allHit
      ? { weight: Math.max(1, lvl - 1), reps: item.min, note: `上次每组都到 ${item.max} 次 → 少 1 档辅助` }
      : { weight: lvl, reps: item.max, note: `保持档位 ${lvl}，争取每组 ${item.max} 次` };
  }
  if (e.load === 'sec') {
    return allHit
      ? { weight: null, reps: bestReps + 10, note: `上次每组都到 ${item.max} 秒 → 加 10 秒` }
      : { weight: null, reps: item.max, note: `目标每组 ${item.max} 秒` };
  }
  if (e.load === 'bw') {
    const w = Math.max(...last.map((s) => s.weight ?? 0));
    return allHit
      ? { weight: w || null, reps: bestReps + 1, note: `上次每组都到 ${item.max} 次 → 多做 1 次或加负重` }
      : { weight: w || null, reps: Math.min(bestReps + 1, item.max), note: `上次最多 ${bestReps} 次，这次争取 ${Math.min(bestReps + 1, item.max)}` };
  }
  const top = Math.max(...last.map((s) => s.weight ?? 0));
  if (!allHit) return { weight: top, reps: item.max, note: `保持 ${top} lb，争取每组 ${item.max} 次` };
  const next = top + e.inc;
  const homeDumbbell = loc === 'home' && e.equip.includes('哑铃') && !e.equip.includes('杠铃');
  if (homeDumbbell && next > HOME_DB_MAX) {
    return { weight: HOME_DB_MAX, reps: item.max + 2, note: '已到家里哑铃上限 45 lb：多做 2 次，或下放放慢到 3 秒' };
  }
  return { weight: next, reps: item.min, note: `上次每组都到 ${item.max} 次 → 加到 ${next} lb` };
}

export function formatSet(e: Exercise, s: Pick<SetRow, 'weight' | 'reps'>): string {
  if (e.load === 'sec') return `${s.reps} 秒`;
  if (e.load === 'level') return `档位 ${s.weight ?? '–'} × ${s.reps}`;
  if (!s.weight) return `自重 × ${s.reps}`;
  return `${s.weight} lb × ${s.reps}`;
}

export const restFor = (item: PlanItem) => item.rest;
