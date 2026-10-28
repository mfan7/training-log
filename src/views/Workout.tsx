import { useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, lastSetsFor, now, putSession, putSet, today, uid } from '../lib/db';
import { ex, sessionLabel, sessionTitle, unitOf } from '../lib/data';
import { formatSet, suggest } from '../lib/plan';
import type { Exercise, Loc, PlanItem, Session, SetRow } from '../lib/types';
import { ExerciseSheet } from './ExerciseSheet';
import { Picker } from './Picker';
import { SwipeRow } from './SwipeRow';
import { useSettings } from '../lib/settings';

type Rest = { end: number; total: number } | null;

export function Workout({ sessionId, onClose }: { sessionId: string; onClose: () => void }) {
  const session = useLiveQuery(() => db.sessions.get(sessionId), [sessionId]);
  const sets = useLiveQuery(
    () => db.sets.where('session_id').equals(sessionId).filter((r) => !r.deleted).sortBy('done_at'),
    [sessionId],
  ) ?? [];
  const [open, setOpen] = useState(0);
  const [rest, setRest] = useState<Rest>(null);
  const [picker, setPicker] = useState<{ mode: 'swap' | 'add'; index?: number } | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const lastLog = useRef(0);
  const settings = useSettings();
  useWakeLock();

  if (!session) return null;
  const plan = session.plan;
  // A session entered after the fact (补录): set times follow the session's date, no rest timer.
  const backfill = session.date < today() && Date.now() - Date.parse(session.started_at) > 6 * 3600e3;
  const doneOf = (id: string) => sets.filter((r) => r.exercise_id === id);

  function nextIndex(i: number, justLogged: number): number {
    const it = plan[i];
    const remaining = (j: number) => plan[j].sets - doneOf(plan[j].ex).length - (j === i ? justLogged : 0);
    if (it.ss) {
      const group = plan.map((p, j) => ({ p, j })).filter(({ p }) => p.ss === it.ss);
      const after = [...group.filter(({ j }) => j > i), ...group.filter(({ j }) => j <= i)];
      const nx = after.find(({ j }) => remaining(j) > 0);
      if (nx) return nx.j;
    } else if (remaining(i) > 0) return i;
    const later = plan.findIndex((_, j) => j > i && remaining(j) > 0);
    if (later >= 0) return later;
    const any = plan.findIndex((_, j) => remaining(j) > 0);
    return any >= 0 ? any : -1;
  }

  async function savePlan(p: PlanItem[]) {
    await putSession({ ...strip(session!), plan: p });
  }

  async function log(i: number, weight: number | null, reps: number) {
    if (Date.now() - lastLog.current < 1000) return; // double tap
    lastLog.current = Date.now();
    const it = plan[i];
    const doneAt = backfill ? new Date(Date.parse(session!.started_at) + (sets.length + 1) * 60e3).toISOString() : now();
    await putSet({
      id: uid(), session_id: sessionId, exercise_id: it.ex, set_no: doneOf(it.ex).length + 1,
      weight, reps, rpe: null, done_at: doneAt, deleted: false,
    });
    const restSec = settings.uniformRest ? settings.rest : it.rest;
    if (!backfill && restSec > 0) setRest({ end: Date.now() + restSec * 1000, total: restSec });
    setOpen(nextIndex(i, 1));
  }

  async function removeItem(i: number) {
    const it = plan[i];
    const logged = doneOf(it.ex);
    if (logged.length && !confirm(`删除「${ex(it.ex).cn}」和已记录的 ${logged.length} 组？`)) return;
    for (const r of logged) await putSet({ ...r, deleted: true });
    await savePlan(plan.filter((_, j) => j !== i));
    setOpen(open > i ? open - 1 : open === i ? -1 : open);
  }

  async function finish() {
    const endedAt = session!.ended_at ?? (backfill ? sets[sets.length - 1]?.done_at ?? session!.started_at : now());
    await putSession({ ...strip(session!), ended_at: endedAt });
    onClose();
  }
  async function discard() {
    if (!confirm('放弃这次训练？已记录的组也会删除。')) return;
    for (const r of sets) await putSet({ ...r, deleted: true });
    await putSession({ ...strip(session!), ended_at: now(), deleted: true });
    onClose();
  }

  const totalDone = sets.length;
  const totalPlanned = plan.reduce((a, p) => a + p.sets, 0);

  return (
    <>
      <header className="wk-head">
        <h1>{sessionLabel(session)}</h1>
        <span>{sessionTitle(session)}，已完成 {totalDone}/{totalPlanned} 组</span>
      </header>

      {plan.map((it, i) => (
        <ItemCard
          key={`${it.ex}-${i}`}
          item={it} loc={session.loc} sessionId={sessionId} done={doneOf(it.ex)} open={open === i}
          onToggle={() => setOpen(open === i ? -1 : i)}
          onLog={(w, r) => log(i, w, r)}
          onSwap={() => setPicker({ mode: 'swap', index: i })}
          onRemove={() => removeItem(i)}
          onInfo={() => setInfo(it.ex)}
        />
      ))}

      <div className="stack section">
        <button className="btn ghost" onClick={() => setPicker({ mode: 'add' })}>加一个动作</button>
        <button className="btn" onClick={finish}>完成训练</button>
        <button className="btn quiet" onClick={discard}>放弃这次训练</button>
      </div>

      {rest && <RestTimer rest={rest} onChange={setRest} />}
      {info && <ExerciseSheet id={info} onClose={() => setInfo(null)} />}
      {picker && (
        <Picker
          loc={session.loc}
          group={picker.index !== undefined ? ex(plan[picker.index].ex).group : undefined}
          title={picker.mode === 'swap' ? '换成其他动作' : '加一个动作'}
          taken={new Set(plan.map((p) => p.ex))}
          onClose={() => setPicker(null)}
          onPick={async (id) => {
            if (picker.mode === 'swap' && picker.index !== undefined) {
              const p = plan.slice(); p[picker.index] = { ...p[picker.index], ex: id }; await savePlan(p);
            } else {
              await savePlan([...plan, { ex: id, sets: settings.sets, min: settings.repMin, max: settings.repMax, rest: settings.rest }]); setOpen(plan.length);
            }
            setPicker(null);
          }}
        />
      )}
    </>
  );
}

const strip = ({ updated_at: _u, dirty: _d, ...s }: Session) => s;

function ItemCard(props: {
  item: PlanItem; loc: Loc; sessionId: string; done: SetRow[]; open: boolean;
  onToggle: () => void; onLog: (w: number | null, r: number) => void; onSwap: () => void; onInfo: () => void;
  onRemove: () => void;
}) {
  const { item, done, open } = props;
  const e = ex(item.ex);
  const last = useLiveQuery(() => lastSetsFor(item.ex, props.sessionId), [item.ex, props.sessionId]);
  const { homeDbMax } = useSettings();
  const sg = useMemo(() => suggest(e, item, last ?? [], props.loc, homeDbMax), [e, item, last, props.loc, homeDbMax]);
  const finished = done.length >= item.sets;

  const removeSet = (r: SetRow) => putSet({ ...r, deleted: true });

  return (
    <section className={`card${finished ? ' done' : ''}`} data-g={e.group}>
      <SwipeRow as="div" className="card-swipe" label={`动作「${e.cn}」`} onDelete={props.onRemove}>
        <header onClick={props.onToggle} role="button" tabIndex={0} aria-expanded={open}
          onKeyDown={(k) => (k.key === 'Enter' || k.key === ' ') && props.onToggle()}>
          <span className="mark" aria-hidden />
          <div className="body">
            <div className="name">{e.cn}{item.ss && <span className="ss">超级组</span>}</div>
            <div className="en">{e.en}</div>
          </div>
          <span className="count">{done.length}/{item.sets}</span>
        </header>
      </SwipeRow>
      {open && (
        <div className="inner">
          <p className="hint">
            目标 {item.sets} 组 × {item.min}–{item.max} {unitOf(e)}。{sg.note}
            {last && last.length > 0 && <><br />上次：{last.map((s) => formatSet(e, s)).join('，')}</>}
          </p>
          {last !== undefined && <SetLogger key={done.length} e={e} sg={sg} prev={done[done.length - 1]} setNo={done.length + 1} onLog={props.onLog} />}
          {done.length > 0 && (
            <>
              <ul className="set-list" aria-label="已完成的组">
                {done.map((r, k) => (
                  <SwipeRow key={r.id} label={`第 ${k + 1} 组`} onDelete={() => removeSet(r)}>
                    <span className="no">{k + 1}</span>{formatSet(e, r)}
                  </SwipeRow>
                ))}
              </ul>
              <p className="swipe-hint">左滑一组可以删除；左滑动作名称可以删除整个动作</p>
            </>
          )}
          <div className="card-actions">
            <button onClick={props.onSwap}>换动作</button>
            <button onClick={props.onInfo}>动作说明</button>
          </div>
        </div>
      )}
    </section>
  );
}

function SetLogger({ e, sg, prev, setNo, onLog }: {
  e: Exercise; sg: { weight: number | null; reps: number }; prev?: SetRow; setNo: number;
  onLog: (w: number | null, r: number) => void;
}) {
  const hasWeight = e.load === 'lb' || e.load === 'level' || e.load === 'bw';
  const [w, setW] = useState<number>(prev?.weight ?? sg.weight ?? (e.load === 'level' ? 10 : 0));
  const [r, setR] = useState<number>(prev?.reps ?? sg.reps);
  const wStep = e.load === 'level' ? 1 : e.inc;
  const rStep = e.load === 'sec' || e.load === 'min' ? 5 : 1;
  const wLabel = e.load === 'level' ? '辅助档位' : e.load === 'bw' ? '额外负重 lb' : '重量 lb';

  return (
    <div className="logger">
      {hasWeight && (
        <Dial label={wLabel} value={w} onChange={setW} step={wStep} min={e.load === 'level' ? 1 : 0} />
      )}
      <Dial label={e.load === 'sec' || e.load === 'min' ? unitOf(e) : '次数'} value={r} onChange={setR} step={rStep} min={0} span={!hasWeight} />
      <button className="btn" onClick={() => onLog(hasWeight ? (e.load === 'level' ? w : w || null) : null, r)} disabled={r <= 0}>
        完成第 {setNo} 组
      </button>
    </div>
  );
}

function Dial({ label, value, onChange, step, min, span }: {
  label: string; value: number; onChange: (v: number) => void; step: number; min: number; span?: boolean;
}) {
  const id = useRef(`d-${Math.random().toString(36).slice(2)}`).current;
  return (
    <div className="dial" style={span ? { gridColumn: 'span 2' } : undefined}>
      <label htmlFor={id}>{label}</label>
      <input id={id} className="val" type="number" inputMode="decimal" value={value}
        onChange={(ev) => onChange(Math.max(min, Number(ev.target.value) || 0))} />
      <div className="steps">
        <button aria-label={`${label}减 ${step}`} onClick={() => onChange(Math.max(min, +(value - step).toFixed(1)))}>−</button>
        <button aria-label={`${label}加 ${step}`} onClick={() => onChange(+(value + step).toFixed(1))}>+</button>
      </div>
    </div>
  );
}

function RestTimer({ rest, onChange }: { rest: NonNullable<Rest>; onChange: (r: Rest) => void }) {
  const [t, setT] = useState(Date.now());
  const buzzed = useRef(false);
  useEffect(() => { buzzed.current = false; }, [rest.end]);
  useEffect(() => {
    const iv = setInterval(() => setT(Date.now()), 250);
    return () => clearInterval(iv);
  }, []);
  const left = Math.round((rest.end - t) / 1000);
  const over = left <= 0;
  useEffect(() => {
    if (over && !buzzed.current) { buzzed.current = true; navigator.vibrate?.([200, 100, 200]); }
  }, [over]);
  const shown = Math.abs(left);
  const mmss = `${over ? '+' : ''}${Math.floor(shown / 60)}:${String(shown % 60).padStart(2, '0')}`;
  const pct = Math.min(100, Math.max(0, (1 - left / rest.total) * 100));
  return (
    <div className={`rest${over ? ' over' : ''}`} role="timer" aria-live="off">
      <div className="bar" style={{ width: `${pct}%` }} />
      <div className="wrap">
        <span className="time">{mmss}</span>
        <span className="lbl">{over ? '休息结束，开始下一组' : '组间休息'}</span>
        {!over && <button onClick={() => onChange({ ...rest, end: rest.end + 15000, total: rest.total + 15 })}>+15 秒</button>}
        <button onClick={() => onChange(null)}>{over ? '关闭' : '跳过'}</button>
      </div>
    </div>
  );
}

/** Keep the phone screen on during a workout where supported. */
function useWakeLock() {
  useEffect(() => {
    let lock: { release: () => Promise<void> } | null = null;
    const nav = navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } };
    const get = () => nav.wakeLock?.request('screen').then((l) => { lock = l; }).catch(() => {});
    void get();
    const onVis = () => { if (document.visibilityState === 'visible') void get(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { document.removeEventListener('visibilitychange', onVis); void lock?.release(); };
  }, []);
}
