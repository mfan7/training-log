import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, lastSetsFor, putSession, today, uid, now } from '../lib/db';
import { ex, template, WEEK_TITLE } from '../lib/data';
import { currentWeek, suggest } from '../lib/plan';
import type { Loc, SetRow, Week } from '../lib/types';

const LOC_LABEL: Record<Loc, string> = { gym: '健身房', home: '居家' };

export function Today({ onOpen, onDetail }: { onOpen: (id: string) => void; onDetail: (id: string) => void }) {
  const sessions = useLiveQuery(() => db.sessions.toArray(), []) ?? [];
  const auto = currentWeek(sessions);
  const [picked, setPicked] = useState<Week | null>(null);
  const week = picked ?? auto;
  const [loc, setLoc] = useState<Loc>('gym');
  const [showAll, setShowAll] = useState(false);
  const [pastDate, setPastDate] = useState<string | null>(null);
  const t = template(week, loc);

  const last = useLiveQuery(async () => {
    const out: Record<string, SetRow[]> = {};
    for (const it of t.items) out[it.ex] = await lastSetsFor(it.ex);
    return out;
  }, [t.key]) ?? {};

  const recent = useLiveQuery(async () => {
    const done = (await db.sessions.toArray()).filter((s) => !s.deleted && s.ended_at)
      .sort((a, b) => b.started_at.localeCompare(a.started_at));
    return Promise.all(done.map(async (s) => ({
      s, n: await db.sets.where('session_id').equals(s.id).filter((r) => !r.deleted).count(),
    })));
  }, []) ?? [];
  const shown = showAll ? recent : recent.slice(0, 6);

  const thisWeekDone = sessions.filter((s) => !s.deleted && s.week === week && s.ended_at && Date.now() - Date.parse(s.started_at) < 7 * 864e5);
  const doneGym = thisWeekDone.some((s) => s.loc === 'gym');
  const doneHome = thisWeekDone.some((s) => s.loc === 'home');

  /** `date` set = entering a past workout (补录); it is placed at noon that day. */
  async function start(date?: string) {
    const id = uid();
    const startedAt = date ? new Date(`${date}T12:00:00`).toISOString() : now();
    await putSession({ id, date: date ?? today(), week, loc, plan: t.items, started_at: startedAt, ended_at: null, notes: '', deleted: false });
    onOpen(id);
  }
  const yesterday = (() => { const d = new Date(); d.setDate(d.getDate() - 1); return d.toLocaleDateString('sv'); })();

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
        <button className="btn" onClick={() => start()}>开始训练</button>
        {pastDate === null ? (
          <button className="btn quiet" onClick={() => setPastDate(yesterday)}>补录过去的训练</button>
        ) : (
          <div className="backfill">
            <label>
              <span>补录 {week} 周{LOC_LABEL[loc]}，日期</span>
              <input className="field" type="date" max={yesterday} value={pastDate} onChange={(e) => setPastDate(e.target.value)} />
            </label>
            <div className="row2">
              <button className="btn ghost" onClick={() => setPastDate(null)}>取消</button>
              <button className="btn" onClick={() => start(pastDate)} disabled={!pastDate || pastDate > yesterday}>开始补录</button>
            </div>
          </div>
        )}
      </div>

      <section className="section">
        <h2>最近训练</h2>
        {recent.length === 0 && <p className="empty">还没有记录。完成第一次训练后会显示在这里。</p>}
        <ul className="list">
          {shown.map(({ s, n }) => (
            <li key={s.id}>
              <button className="row tap" onClick={() => onDetail(s.id)}>
                <div className="body">
                  <div className="name">{s.date}　{s.week} 周{LOC_LABEL[s.loc]}</div>
                  <div className="note">{template(s.week, s.loc).title}</div>
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
