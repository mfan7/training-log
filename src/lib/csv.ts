import { db } from './db';
import { ex, sessionTitle } from './data';

const cell = (v: unknown) => {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export async function exportCsv(): Promise<void> {
  const sessions = new Map((await db.sessions.toArray()).filter((s) => !s.deleted).map((s) => [s.id, s]));
  const sets = (await db.sets.toArray()).filter((r) => !r.deleted && sessions.has(r.session_id));
  sets.sort((a, b) => a.done_at.localeCompare(b.done_at));
  const header = ['date', 'week', 'plan', 'location', 'exercise_id', 'name_cn', 'name_en', 'set_no', 'weight', 'reps', 'rpe', 'done_at'];
  const lines = [header.join(',')];
  for (const r of sets) {
    const s = sessions.get(r.session_id)!;
    const e = ex(r.exercise_id);
    lines.push([s.date, s.week, sessionTitle(s), s.loc, r.exercise_id, e.cn, e.en, r.set_no, r.weight, r.reps, r.rpe, r.done_at].map(cell).join(','));
  }
  const blob = new Blob(['\ufeff' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `training-log-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}
