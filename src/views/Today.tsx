import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, lastSetsFor, putSession, today, uid, now } from '../lib/db';
import { ex, letter, LOC_LABEL, sessionLabel, sessionTitle } from '../lib/data';
import { rotationOf, suggest, suggestTemplate, weekKey } from '../lib/plan';
import type { Loc, SetRow } from '../lib/types';
import type { Muscle } from 'react-body-highlighter';
import { groupsWorked, MUSCLE_NAME, musclesOf } from '../lib/muscles';
import { BodyMap, type Fill } from './BodyMap';
import { useSettings } from '../lib/settings';

// Survives leaving 今天 for the plan editor or a workout, until the app is closed.
const remembered: { loc: Loc; picked: string | null } = { loc: 'gym', picked: null };

export function Today({ onOpen, onEditPlan, onPlans }: {
  onOpen: (id: string) => void;
  onEditPlan: (id: string | 'new', loc: Loc) => void; onPlans: () => void;
}) {
  const sessions = useLiveQuery(() => db.sessions.toArray(), []) ?? [];
  const templates = useLiveQuery(() => db.templates.filter((t) => !t.deleted).toArray(), []);
  const [loc, setLocState] = useState<Loc>(remembered.loc);
  const [picked, setPickedState] = useState<string | null>(remembered.picked);
  const setPicked = (id: string | null) => { remembered.picked = id; setPickedState(id); };
  const [pastDate, setPastDate] = useState<string | null>(null);
  const settings = useSettings();
  const setLoc = (l: Loc) => { remembered.loc = l; setLocState(l); setPicked(null); };

  const all = templates ?? [];
  const rot = rotationOf(all, loc);
  const others = all.filter((t) => t.loc === loc && !t.rotation).sort((a, b) => a.name.localeCompare(b.name, 'zh'));
  const auto = suggestTemplate(sessions, all, loc);
  const t = all.find((x) => x.id === picked && x.loc === loc) ?? auto ?? others[0];
  const slot = t ? rot.findIndex((x) => x.id === t.id) : -1;

  const last = useLiveQuery(async () => {
    const out: Record<string, SetRow[]> = {};
    for (const it of t?.items ?? []) out[it.ex] = await lastSetsFor(it.ex);
    return out;
  }, [t?.id, t?.updated_at]) ?? {};


  const thisWeek = sessions.filter((s) => !s.deleted && s.ended_at && weekKey(new Date(s.started_at)) === weekKey(new Date()));
  const doneGym = thisWeek.some((s) => s.loc === 'gym');
  const doneHome = thisWeek.some((s) => s.loc === 'home');

  /** `date` set = entering a past workout (补录); it is placed at noon that day. */
  async function start(date?: string) {
    if (!t) return;
    const id = uid();
    const startedAt = date ? new Date(`${date}T12:00:00`).toISOString() : now();
    await putSession({
      id, date: date ?? today(), week: letter(slot), loc, plan: t.items, template_id: t.id, title: t.name,
      started_at: startedAt, ended_at: null, notes: '', deleted: false,
    });
    onOpen(id);
  }
  const yesterday = (() => { const d = new Date(); d.setDate(d.getDate() - 1); return d.toLocaleDateString('sv'); })();

  if (!templates) return null;

  return (
    <>
      <section className="hero" aria-label="本周">
        <div className="letter">{t ? letter(slot) : '–'}</div>
        <div className="title">{t?.name ?? `还没有${LOC_LABEL[loc]}计划`}</div>
        <div className="sub">
          {auto && t && t.id !== auto.id
            ? `按轮转应为 ${letter(rot.indexOf(auto))} ${auto.name}`
            : `本周健身房${doneGym ? '已练' : '未练'}，居家${doneHome ? '已练' : '未练'}`}
        </div>
      </section>

      <div className="seg loc-seg" role="group" aria-label="地点">
        {(['gym', 'home'] as Loc[]).map((l) => (
          <button key={l} aria-pressed={loc === l} onClick={() => setLoc(l)}>{LOC_LABEL[l]}</button>
        ))}
      </div>

      <div className="focus">
        <label htmlFor="focus">本周重点</label>
        <div className="focus-row">
          <select id="focus" className="field" value={t?.id ?? ''} onChange={(e) => setPicked(e.target.value)} disabled={!t}>
            {rot.map((x, i) => (
              <option key={x.id} value={x.id}>{letter(i)} · {x.name}{auto?.id === x.id ? '（轮转）' : ''}</option>
            ))}
            {others.length > 0 && (
              <optgroup label="不在轮转里">
                {others.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
              </optgroup>
            )}
          </select>
          {t && <button className="btn ghost small" onClick={() => onEditPlan(t.id, loc)}>编辑</button>}
        </div>
        <button className="link" onClick={onPlans}>管理计划（新建、排序、删除）</button>
      </div>

      {!t && (
        <div className="section">
          <button className="btn" onClick={() => onEditPlan('new', loc)}>新建{LOC_LABEL[loc]}计划</button>
        </div>
      )}

      {t && (
        <>
          {t.items.length === 0 && <p className="empty">这个计划还没有动作，点「编辑」添加。</p>}
          {t.items.length > 0 && <PlanMap key={t.id} exIds={t.items.map((it) => it.ex)} />}
          <ul className="list">
            {t.items.map((it, i) => {
              const e = ex(it.ex);
              const sg = suggest(e, it, last[it.ex] ?? [], loc, settings.homeDbMax);
              return (
                <li className="row" key={`${it.ex}-${i}`} data-g={e.group}>
                  <span className="mark" aria-hidden />
                  <div className="body">
                    <div className="name">{e.cn}{it.ss && <span className="ss">超级组</span>}</div>
                    <div className="note">{sg.note}</div>
                  </div>
                  <div className="dose">{it.sets}×{it.min}–{it.max}{e.load === 'sec' ? '″' : ''}</div>
                </li>
              );
            })}
          </ul>

          <div className="section">
            <button className="btn" onClick={() => start()}>开始训练</button>
            {pastDate === null ? (
              <button className="btn quiet" onClick={() => setPastDate(yesterday)}>补录过去的训练</button>
            ) : (
              <div className="backfill">
                <label>
                  <span>补录「{t.name}」（{LOC_LABEL[loc]}），日期</span>
                  <input className="field" type="date" max={yesterday} value={pastDate} onChange={(e) => setPastDate(e.target.value)} />
                </label>
                <div className="row2">
                  <button className="btn ghost" onClick={() => setPastDate(null)}>取消</button>
                  <button className="btn" onClick={() => start(pastDate)} disabled={!pastDate || pastDate > yesterday}>开始补录</button>
                </div>
              </div>
            )}
          </div>
        </>
      )}

    </>
  );
}

/** Which muscles a plan works: primary dark, secondary light; tap a muscle to see its exercises. */
function PlanMap({ exIds }: { exIds: string[] }) {
  const [focus, setFocus] = useState<Muscle | null>(null);
  const fills = new Map<Muscle, Fill>();
  const by = new Map<Muscle, string[]>();
  for (const id of exIds) {
    const { primary, secondary } = musclesOf(ex(id));
    for (const m of secondary) if (!fills.has(m)) fills.set(m, 'var(--plan-2)');
    for (const m of primary) fills.set(m, 'var(--plan-1)');
    for (const m of [...primary, ...secondary]) by.set(m, [...(by.get(m) ?? []), ex(id).cn]);
  }
  const hit = focus && by.get(focus);
  return (
    <section className="plan-map">
      <p className="worked">要练：<b>{groupsWorked(exIds).join(' · ')}</b></p>
      <BodyMap fills={fills} label="这个计划练到的肌肉" onSelect={(m) => setFocus(by.has(m) && focus !== m ? m : null)} />
      <p className="hint">{hit ? `${MUSCLE_NAME[focus!] ?? focus}：${hit.join('、')}` : '深色为主练部位，浅色为协同肌；点部位看对应动作。'}</p>
    </section>
  );
}
