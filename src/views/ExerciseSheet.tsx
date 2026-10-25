import { useEffect, useState, type ReactNode } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, putExercise } from '../lib/db';
import { ex } from '../lib/data';
import { formatSet } from '../lib/plan';
import { ExerciseForm } from './ExerciseForm';

export function Sheet({ onClose, children, label }: { onClose: () => void; children: ReactNode; label: string }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="scrim" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={label} onClick={(e) => e.stopPropagation()}>
        <button className="close" onClick={onClose}>关闭</button>
        {children}
      </div>
    </div>
  );
}

export function ExerciseSheet({ id, onClose }: { id: string; onClose: () => void }) {
  const [editing, setEditing] = useState(false);
  useLiveQuery(() => db.exercises.get(id), [id]); // re-render after an edit
  const e = ex(id);
  const history = useLiveQuery(async () => {
    const rows = await db.sets.where('exercise_id').equals(id).filter((r) => !r.deleted).toArray();
    const bySession = new Map<string, typeof rows>();
    for (const r of rows) bySession.set(r.session_id, [...(bySession.get(r.session_id) ?? []), r]);
    const sessions = await db.sessions.bulkGet([...bySession.keys()]);
    return sessions
      .filter((s): s is NonNullable<typeof s> => !!s && !s.deleted)
      .sort((a, b) => b.started_at.localeCompare(a.started_at))
      .slice(0, 8)
      .map((s) => ({ s, sets: bySession.get(s.id)!.sort((a, b) => a.set_no - b.set_no) }));
  }, [id]) ?? [];

  async function remove() {
    const row = await db.exercises.get(id);
    if (!row || !confirm(`删除动作「${e.cn}」？已有的记录会保留。`)) return;
    const { updated_at: _u, dirty: _d, ...rest } = row;
    await putExercise({ ...rest, deleted: true });
    onClose();
  }

  if (editing) return <ExerciseForm initial={e} onSaved={() => setEditing(false)} onClose={() => setEditing(false)} />;

  return (
    <Sheet onClose={onClose} label={e.cn}>
      <h2>{e.cn}</h2>
      <p className="en">{e.en}</p>
      <dl>
        <dt>分类</dt><dd>{e.custom ? `自定义动作 · ${e.group}` : `${e.catName}（${e.size === '—' ? '辅助' : `${e.size}肌群`}）`}</dd>
        <dt>主要肌群</dt><dd>{e.muscles}</dd>
        <dt>器材</dt><dd>{e.equip}</dd>
        {e.cue && <><dt>动作要点</dt><dd>{e.cue}</dd></>}
        <dt>居家</dt><dd>{e.home ? `可以${e.homeNote ? `：${e.homeNote}` : ''}` : e.homeNote || '不适合在家做'}</dd>
      </dl>

      <h3>最近记录</h3>
      {history.length === 0 ? <p className="msg">还没有记录。</p> : (
        <ul>{history.map(({ s, sets }) => (
          <li key={s.id}>{s.date}：{sets.map((r) => formatSet(e, r)).join('，')}</li>
        ))}</ul>
      )}

      {e.legacy.length > 0 && (
        <>
          <h3>早年教练课记录</h3>
          <ul>{e.legacy.map((l) => <li key={l}>{l}</li>)}</ul>
        </>
      )}
      {e.custom && (
        <div className="stack section">
          <button className="btn ghost" onClick={() => setEditing(true)}>编辑这个动作</button>
          <button className="btn quiet" onClick={remove}>删除这个动作</button>
        </div>
      )}
    </Sheet>
  );
}
