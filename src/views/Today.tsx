import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, lastSetsFor, putSession, today, uid, now } from '../lib/db';
import { ex, template, WEEK_TITLE } from '../lib/data';
import { currentWeek, suggest } from '../lib/plan';
import type { Loc, SetRow, Week } from '../lib/types';

const LOC_LABEL: Record<Loc, string> = { gym: '健身房', home: '居家' };

export function Today({ onOpen }: { onOpen: (id: string) => void }) {
  const sessions = useLiveQuery(() => db.sessions.toArray(), []) ?? [];
  const auto = currentWeek(sessions);
  const [picked, setPicked] = useState<Week | null>(null);
  const week = picked ?? auto;
  const [loc, setLoc] = useState<Loc>('gym');
  const t = template(week, loc);

  const last = useLiveQuery(async () => {
    const out: Record<string, SetRow[]> = {};
    for (const it of t.items) out[it.ex] = await lastSetsFor(it.ex);
    return out;
  }, [t.key]) ?? {};

  const recent = useLiveQuery(async () => {
    const done = (await db.sessions.toArray()).filter((s) => !s.deleted && s.ended_at)
      .sort((a, b) => b.started_at.localeCompare(a.started_at)).slice(0, 6);
    return Promise.all(done.map(async (s) => ({
      s, n: await db.sets.where('session_id').equals(s.id).filter((r) => !r.deleted).count(),
    })));
  }, []) ?? [];

  const thisWeekDone = sessions.filter((s) => !s.deleted && s.week === week && s.ended_at && Date.now() - Date.parse(s.started_at) < 7 * 864e5);
  const doneGym = thisWeekDone.some((s) => s.loc === 'gym');
  const doneHome = thisWeekDone.some((s) => s.loc === 'home');

  async function start() {
    const id = uid();
    await putSession({ id, date: today(), week, loc, plan: t.items, started_at: now(), ended_at: null, notes: '', deleted: false });
    onOpen(id);
  }

  return (
    <>
      <section className="hero" aria-label="本周">
        <div className="letter">{week}</div>
        <div className="title">{WEEK_TITLE[week]}</div>
        <div className="sub">
          {picked && picked !== auto ? `按轮转应为 ${auto} 周` : `本周健身房${doneGym ? '已练' : '未练'}，居家${doneHome ? '已练' : '未练'}`}
        </div>
      </section>

      <div className="controls">
        <div className="seg" role="group" aria-label="地点">
          {(['gym', 'home'] as Loc[]).map((l) => (
            <button key={l} aria-pressed={loc === l} onClick={() => setLoc(l)}>{LOC_LABEL[l]}</button>
          ))}
        </div>
        <div className="seg" role="group" aria-label="轮转周">
          {(['A', 'B', 'C'] as Week[]).map((w) => (
            <button key={w} aria-pressed={week === w} onClick={() => setPicked(w === auto ? null : w)}>{w}</button>
          ))}
        </div>
      </div>

      <p className="hint">{loc === "home" ? "居家练健身房这周没练到的两个大肌群。" : "大重量和器械动作放在健身房做。"}</p>
      <ul className="list">
        {t.items.map((it) => {
          const e = ex(it.ex);
          const sg = suggest(e, it, last[it.ex] ?? [], loc);
          return (
            <li className="row" key={it.ex} data-g={e.group}>
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
        <button className="btn" onClick={start}>开始训练</button>
      </div>

      <section className="section">
        <h2>最近训练</h2>
        {recent.length === 0 && <p className="empty">还没有记录。完成第一次训练后会显示在这里。</p>}
        <ul className="list">
          {recent.map(({ s, n }) => (
            <li className="row" key={s.id}>
              <div className="body">
                <div className="name">{s.date}　{s.week} 周{LOC_LABEL[s.loc]}</div>
                <div className="note">{template(s.week, s.loc).title}</div>
              </div>
              <div className="dose">{n} 组</div>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
