import { useLiveQuery } from 'dexie-react-hooks';
import { db, lastSetsFor, putSession, putSet, volume } from '../lib/db';
import { ex, WEEK_TITLE } from '../lib/data';
import { formatSet } from '../lib/plan';
import type { Session } from '../lib/types';
import { SwipeRow } from './SwipeRow';

const LOC_LABEL = { gym: '健身房', home: '居家' } as const;
const fmt = (n: number) => n.toLocaleString('en-US');

/** One past (or current) session: every exercise with its sets, volume, and the change from last time. */
export function SessionDetail({ id, onBack, onEdit }: { id: string; onBack: () => void; onEdit: (id: string) => void }) {
  const data = useLiveQuery(async () => {
    const s = await db.sessions.get(id);
    if (!s || s.deleted) return null;
    const sets = (await db.sets.where('session_id').equals(id).filter((r) => !r.deleted).toArray())
      .sort((a, b) => a.done_at.localeCompare(b.done_at));
    const order = [...new Set([...s.plan.map((p) => p.ex), ...sets.map((r) => r.exercise_id)])];
    const groups = await Promise.all(order
      .filter((exId) => sets.some((r) => r.exercise_id === exId))
      .map(async (exId) => {
        const mine = sets.filter((r) => r.exercise_id === exId);
        return { exId, sets: mine, prev: await lastSetsFor(exId, id, mine[0].done_at) };
      }));
    return { s, groups, count: sets.length };
  }, [id]);

  if (data === undefined) return null;
  if (data === null) {
    return (
      <>
        <BackBar onBack={onBack} />
        <p className="empty">这次训练已删除。</p>
      </>
    );
  }

  const { s, groups, count } = data;
  const total = groups.filter((g) => ex(g.exId).load === 'lb').reduce((a, g) => a + volume('lb', g.sets).value, 0);
  const minutes = s.ended_at ? Math.round((Date.parse(s.ended_at) - Date.parse(s.started_at)) / 60e3) : null;

  async function remove() {
    if (!confirm('删除这次训练和它的所有组？')) return;
    for (const g of groups) for (const r of g.sets) await putSet({ ...r, deleted: true });
    await putSession({ ...strip(s), deleted: true });
    onBack();
  }

  return (
    <>
      <BackBar onBack={onBack} />
      <header className="detail-head">
        <h1>{s.date}</h1>
        <p>{s.week} 周{LOC_LABEL[s.loc]} · {WEEK_TITLE[s.week]}{s.ended_at ? '' : ' · 进行中'}</p>
      </header>

      <dl className="stats">
        <div><dt>组数</dt><dd>{count}</dd></div>
        <div><dt>总容量</dt><dd>{fmt(total)}<small> lb</small></dd></div>
        <div><dt>时长</dt><dd>{minutes && minutes > 0 && minutes < 360 ? <>{minutes}<small> 分</small></> : '–'}</dd></div>
      </dl>

      {groups.length === 0 && <p className="empty">这次训练没有记录任何组。</p>}
      {groups.map(({ exId, sets, prev }) => {
        const e = ex(exId);
        const v = volume(e.load, sets);
        const pv = prev.length ? volume(e.load, prev) : null;
        const diff = pv ? v.value - pv.value : null;
        return (
          <section className="card detail" key={exId} data-g={e.group}>
            <header>
              <span className="mark" aria-hidden />
              <div className="body">
                <div className="name">{e.cn}</div>
                <div className="en">{e.en}</div>
              </div>
              <div className="vol">
                <b>{fmt(v.value)}</b> {v.unit}
                {diff !== null && (
                  <span className={diff > 0 ? 'up' : diff < 0 ? 'down' : ''}>
                    {diff > 0 ? `▲ ${fmt(diff)}` : diff < 0 ? `▼ ${fmt(-diff)}` : '持平'}
                  </span>
                )}
              </div>
            </header>
            <ul className="set-list" aria-label={`${e.cn}的组`}>
              {sets.map((r, k) => (
                <SwipeRow key={r.id} label={`${e.cn}第 ${k + 1} 组`} onDelete={() => putSet({ ...r, deleted: true })}>
                  <span className="no">{k + 1}</span>{formatSet(e, r)}
                </SwipeRow>
              ))}
            </ul>
            {prev.length > 0 && <p className="prev">上次：{prev.map((r) => formatSet(e, r)).join('，')}</p>}
          </section>
        );
      })}

      {groups.length > 0 && <p className="swipe-hint">左滑一组可以删除。▲▼ 是和上次做这个动作相比。</p>}
      <div className="stack section">
        <button className="btn ghost" onClick={() => onEdit(s.id)}>{s.ended_at ? '继续编辑（加组、换动作）' : '回到训练'}</button>
        <button className="btn quiet" onClick={remove}>删除这次训练</button>
      </div>
    </>
  );
}

function BackBar({ onBack }: { onBack: () => void }) {
  return <div className="backbar"><button onClick={onBack}>‹ 返回</button></div>;
}

const strip = ({ updated_at: _u, dirty: _d, ...s }: Session) => s;
