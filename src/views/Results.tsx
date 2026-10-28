import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import type { Muscle } from 'react-body-highlighter';
import { db } from '../lib/db';
import { ex, sessionLabel, sessionTitle } from '../lib/data';
import { formatSet } from '../lib/plan';
import { MUSCLE_NAME, volumeFill } from '../lib/muscles';
import { progressFor, RANGE_LABEL, type ExerciseProgress, type Range } from '../lib/progress';
import { BodyMap, VolumeLegend, type Fill } from './BodyMap';

// Survives switching tabs, until the app is closed.
let rememberedRange: Range = 'week';
const fmt1 = (n: number) => (Math.round(n * 10) / 10).toString();
const pct = (c: number) => `${c > 0 ? '▲' : c < 0 ? '▼' : ''} ${Math.abs(Math.round(c * 100))}%`;

/** What the training added up to over a period: muscles worked, strength changes, past sessions. */
export function Results({ onDetail }: { onDetail: (id: string) => void }) {
  const [range, setRangeState] = useState<Range>(rememberedRange);
  const [focus, setFocus] = useState<Muscle | null>(null);
  const [showAll, setShowAll] = useState(false);
  const setRange = (r: Range) => { rememberedRange = r; setRangeState(r); setFocus(null); };
  const p = useLiveQuery(() => progressFor(range), [range]);

  const recent = useLiveQuery(async () => {
    const done = (await db.sessions.toArray()).filter((s) => !s.deleted && s.ended_at)
      .sort((a, b) => b.started_at.localeCompare(a.started_at));
    return Promise.all(done.map(async (s) => ({
      s, n: await db.sets.where('session_id').equals(s.id).filter((r) => !r.deleted).count(),
    })));
  }, []) ?? [];
  const shownRecent = showAll ? recent : recent.slice(0, 6);

  const fills = new Map<Muscle, Fill>();
  if (p) for (const [m, v] of p.volume) fills.set(m, volumeFill(v.sets / p.weeks) as Fill);
  const focused = focus && p?.volume.get(focus);
  const perWeekLabel = range === 'week' ? '组' : '组/周';

  return (
    <>
      <div className="seg range-seg" role="group" aria-label="时间范围">
        {(Object.keys(RANGE_LABEL) as Range[]).map((r) => (
          <button key={r} aria-pressed={range === r} onClick={() => setRange(r)}>{RANGE_LABEL[r]}</button>
        ))}
      </div>

      {p && (
        <>
          <p className="worked">
            训练 <b>{p.sessions.length}</b> 次
            {range !== 'week' && p.sessions.length > 0 && <> · 平均每周 <b>{fmt1(p.sessions.length / p.weeks)}</b> 次</>}
            {p.records > 0 && <> · <span className="pr-text">🏆 新纪录 <b>{p.records}</b></span></>}
          </p>

          {p.sessions.length === 0 ? <p className="empty">{RANGE_LABEL[range]}还没有训练。</p> : (
            <>
              <BodyMap fills={fills} label={`${RANGE_LABEL[range]}练到的肌肉`}
                onSelect={(m) => setFocus(p.volume.has(m) && focus !== m ? m : null)} />
              <VolumeLegend note={range === 'week'
                ? '颜色 = 本周到目前为止的有效组数（主练 1 组，协同 0.5 组）；每周建议 10–20 组。'
                : range === 'all'
                  ? '颜色 = 开始记录以来平均每周的有效组数，停练的周也算在内，反映长期的偏重和短板。'
                  : `颜色 = ${RANGE_LABEL[range]}平均每周的有效组数（主练 1 组，协同 0.5 组）；建议 10–20 组。`} />

              {focused ? (
                <section className="muscle-panel">
                  <div className="mp-head">
                    <h2>{MUSCLE_NAME[focus!] ?? focus}</h2>
                    <span>{fmt1(focused.sets / p.weeks)} {perWeekLabel}</span>
                    <button className="chip-on" onClick={() => setFocus(null)}>✕</button>
                  </div>
                  <ul className="ex-results">
                    {[...focused.exercises].sort((a, b) => b[1].sets - a[1].sets).map(([id, v]) => (
                      <ProgressRow key={id} p={p.exercises.get(id)} exId={id} note={`${v.primary ? '主练' : '协同'} · ${v.sets} 组`} />
                    ))}
                  </ul>
                </section>
              ) : <p className="hint center">点人体图上的部位，看练它的动作和力量变化</p>}

              <section className="section">
                <h2>肌群一览（{range === 'week' ? '本周组数' : '平均每周组数'}）</h2>
                <ul className="group-list">
                  {p.groups.map((g) => {
                    const warn = range !== 'week' && (g.perWeek === 0 ? '没练' : g.perWeek < 5 ? '偏少' : null);
                    return (
                      <li key={g.group} data-g={g.group}>
                        <span className="mark" aria-hidden />
                        <span className="g">{g.group}</span>
                        <span className="bar"><i style={{ width: `${Math.min(100, (g.perWeek / 20) * 100)}%`, background: volumeFill(g.perWeek) }} /></span>
                        <span className="n">{fmt1(g.perWeek)}</span>
                        <span className="t">
                          {warn ? <em>⚠ {warn}</em> : <>{g.up > 0 && <b className="up">▲{g.up}</b>}{g.down > 0 && <b className="down">▼{g.down}</b>}</>}
                        </span>
                      </li>
                    );
                  })}
                </ul>
                <p className="legend-note">条形满格 = 20 组；▲▼ = 力量进步 / 退步的动作数</p>
              </section>

              <section className="section">
                <h2>力量变化</h2>
                <ul className="ex-results">
                  {[...p.exercises.values()].filter((x) => x.change !== null)
                    .sort((a, b) => (b.change ?? 0) - (a.change ?? 0))
                    .map((x) => <ProgressRow key={x.exId} p={x} exId={x.exId} note={`${x.sets} 组`} />)}
                </ul>
                {[...p.exercises.values()].every((x) => x.change === null) && (
                  <p className="empty">同一个动作做过两次以上，这里才会显示力量变化。</p>
                )}
              </section>
            </>
          )}
        </>
      )}

      <section className="section">
        <h2>最近训练</h2>
        {recent.length === 0 && <p className="empty">还没有记录。完成第一次训练后会显示在这里。</p>}
        <ul className="list">
          {shownRecent.map(({ s, n }) => (
            <li key={s.id}>
              <button className="row tap" onClick={() => onDetail(s.id)}>
                <div className="body">
                  <div className="name">{s.date}　{sessionLabel(s)}</div>
                  <div className="note">{sessionTitle(s)}</div>
                </div>
                <div className="dose">{n} 组</div>
                <span className="chev" aria-hidden>›</span>
              </button>
            </li>
          ))}
        </ul>
        {recent.length > 6 && (
          <button className="btn quiet" onClick={() => setShowAll(!showAll)}>{showAll ? '收起' : `查看全部（${recent.length} 次）`}</button>
        )}
      </section>
    </>
  );
}

/** One exercise: strongest set at the start of the period → strongest in it, and the change. */
function ProgressRow({ p, exId, note }: { p?: ExerciseProgress; exId: string; note: string }) {
  const e = ex(exId);
  const c = p?.change ?? null;
  return (
    <li className={c === null ? 'pg-none' : c > 0.0001 ? 'pg-up' : c < -0.0001 ? 'pg-down' : 'pg-same'}>
      <div className="body">
        <div className="name">{e.cn}{p && p.records > 0 && <span className="ss">🏆 ×{p.records}</span>}</div>
        <div className="sets">
          {p ? (c === null ? formatSet(e, p.to) : <>{formatSet(e, p.from)} → {formatSet(e, p.to)}</>) : '—'}
        </div>
        <div className="note">{note}</div>
      </div>
      <div className="verdict">
        <span className="lv">{c === null ? '暂无对比' : pct(c)}</span>
      </div>
    </li>
  );
}
