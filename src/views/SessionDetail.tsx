import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import type { Muscle } from 'react-body-highlighter';
import { db, putSession, putSet } from '../lib/db';
import { ex, sessionLabel, sessionTitle } from '../lib/data';
import { formatSet } from '../lib/plan';
import { compactSets, groupsWorked, LEVEL_LABEL, MUSCLE_NAME, muscleLevels, musclesOf, rateSession, type Level } from '../lib/muscles';
import type { Session } from '../lib/types';
import { BodyMap, type Fill } from './BodyMap';

const FILL: Record<Level, [Fill, Fill]> = {
  pr: ['var(--lv-pr)', 'var(--lv-pr-2)'], high: ['var(--lv-high)', 'var(--lv-high-2)'],
  mid: ['var(--lv-mid)', 'var(--lv-mid-2)'], low: ['var(--lv-low)', 'var(--lv-low-2)'],
  first: ['var(--lv-first)', 'var(--lv-first-2)'],
};

/** One session at a glance: muscles worked and how hard, on a body map, then each exercise in one line. */
export function SessionDetail({ id, onBack, onEdit }: { id: string; onBack: () => void; onEdit: (id: string) => void }) {
  const [focus, setFocus] = useState<Muscle | null>(null);
  const data = useLiveQuery(async () => {
    const s = await db.sessions.get(id);
    if (!s || s.deleted) return null;
    const sets = (await db.sets.where('session_id').equals(id).filter((r) => !r.deleted).toArray())
      .sort((a, b) => a.done_at.localeCompare(b.done_at));
    const order = [...new Set([...s.plan.map((p) => p.ex), ...sets.map((r) => r.exercise_id)])];
    const results = (await rateSession(id, sets)).sort((a, b) => order.indexOf(a.exId) - order.indexOf(b.exId));
    return { s, results };
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

  const { s, results } = data;
  const minutes = s.ended_at ? Math.round((Date.parse(s.ended_at) - Date.parse(s.started_at)) / 60e3) : null;
  const levels = muscleLevels(results);
  const fills = new Map([...levels].map(([m, v]) => [m, FILL[v.level][v.primary ? 0 : 1]] as const));
  const shown = focus ? results.filter((r) => levels.get(focus)?.exercises.includes(r.exId)) : results;
  const count = (f: (r: (typeof results)[number]) => boolean) => results.filter(f).length;
  const prs = count((r) => r.level === 'pr');
  const ups = count((r) => r.trend === 'up');
  const downs = count((r) => r.trend === 'down');
  const compared = results.some((r) => r.trend !== null);

  async function remove() {
    if (!confirm('删除这次训练和它的所有组？')) return;
    for (const r of results) for (const x of r.sets) await putSet({ ...x, deleted: true });
    await putSession({ ...strip(s), deleted: true });
    onBack();
  }

  return (
    <>
      <BackBar onBack={onBack} />
      <header className="detail-head">
        <h1>{s.date}</h1>
        <p>
          {sessionTitle(s)}（{sessionLabel(s)}）
          {minutes && minutes > 0 && minutes < 360 ? ` · ${minutes} 分钟` : ''}{s.ended_at ? '' : ' · 进行中'}
        </p>
      </header>

      {results.length === 0 ? <p className="empty">这次训练没有记录任何组。</p> : (
        <>
          <section className="summary">
            <p className="worked">练到：<b>{groupsWorked(results.map((r) => r.exId)).join(' · ') || '—'}</b></p>
            {compared && (
              <p className="trend-line">
                {prs > 0 && <span className="pr">🏆 新纪录 {prs}</span>}
                <span className="up">▲ 进步 {ups}</span>
                <span className="down">▼ 退步 {downs}</span>
              </p>
            )}
          </section>

          <BodyMap fills={fills} label="这次训练练到的肌肉" onSelect={(m) => setFocus(levels.has(m) && focus !== m ? m : null)} />
          <ul className="legend" aria-label="颜色说明">
            <li><i style={{ background: 'var(--lv-high)' }} />接近最佳 / 新纪录</li>
            <li><i style={{ background: 'var(--lv-mid)' }} />中等</li>
            <li><i style={{ background: 'var(--lv-low)' }} />轻松</li>
            <li><i style={{ background: 'var(--lv-first)' }} />首次</li>
            <li><i style={{ background: 'var(--lv-high-2)' }} />浅色 = 协同肌</li>
          </ul>

          <div className="focus-bar">
            {focus
              ? <button className="chip-on" onClick={() => setFocus(null)}>只看 {MUSCLE_NAME[focus] ?? focus} ✕</button>
              : <span className="hint">点人体图上的部位，只看练到它的动作</span>}
          </div>

          <ul className="ex-results">
            {shown.map((r) => {
              const e = ex(r.exId);
              const role = focus ? (musclesOf(e).primary.includes(focus) ? '主练' : '协同') : null;
              return (
                <li key={r.exId} className={`lv-${r.level}`}>
                  <span className="dot" aria-hidden />
                  <div className="body">
                    <div className="name">{e.cn}{role && <span className="ss">{role}</span>}</div>
                    <div className="sets">{compactSets(r.sets.map((x) => formatSet(e, x)))}</div>
                    <div className="note">{r.best ? `之前最佳 ${formatSet(e, r.best)}` : '第一次做这个动作'}</div>
                  </div>
                  <div className="verdict">
                    <span className="lv">{LEVEL_LABEL[r.level]}</span>
                    {r.trend && <span className={`tr ${r.trend}`}>{r.trend === 'up' ? '▲ 比上次强' : r.trend === 'down' ? '▼ 比上次弱' : '和上次持平'}</span>}
                  </div>
                </li>
              );
            })}
          </ul>
          <p className="swipe-hint">强度按重量和次数折算的力量，和你自己做这个动作的历史最佳比。</p>
        </>
      )}

      <div className="stack section">
        <button className="btn ghost" onClick={() => onEdit(s.id)}>{s.ended_at ? '编辑这次训练' : '回到训练'}</button>
        <button className="btn quiet" onClick={remove}>删除这次训练</button>
      </div>
    </>
  );
}

function BackBar({ onBack }: { onBack: () => void }) {
  return <div className="backbar"><button onClick={onBack}>‹ 返回</button></div>;
}

const strip = ({ updated_at: _u, dirty: _d, ...s }: Session) => s;
