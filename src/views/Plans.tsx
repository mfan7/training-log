import { useLiveQuery } from 'dexie-react-hooks';
import { db, putTemplate } from '../lib/db';
import { letter, LOC_LABEL } from '../lib/data';
import { rotationOf } from '../lib/plan';
import type { Loc, Template } from '../lib/types';

const strip = ({ updated_at: _u, dirty: _d, ...t }: Template) => t;

/** All plans per place: the rotation in order (reorderable), then plans outside it. */
export function Plans({ onBack, onEdit }: { onBack: () => void; onEdit: (id: string | 'new', loc: Loc) => void }) {
  const templates = useLiveQuery(() => db.templates.filter((t) => !t.deleted).toArray(), []);
  if (!templates) return null;

  async function move(rot: Template[], i: number, by: number) {
    const order = rot.slice();
    [order[i], order[i + by]] = [order[i + by], order[i]];
    // renumber the whole rotation so positions stay unique
    for (const [k, t] of order.entries()) if (t.position !== k) await putTemplate({ ...strip(t), position: k });
  }

  return (
    <>
      <div className="backbar"><button onClick={onBack}>‹ 返回</button></div>
      <h1 className="page-title">训练计划</h1>
      <p className="hint">轮转里的计划按顺序每周换一个（A → B → C → A…），同一周内健身房和居家用同一个字母。「本周重点」里随时可以换别的计划。</p>

      {(['gym', 'home'] as Loc[]).map((loc) => {
        const rot = rotationOf(templates, loc);
        const others = templates.filter((t) => t.loc === loc && !t.rotation);
        return (
          <section className="section" key={loc}>
            <h2>{LOC_LABEL[loc]}</h2>
            <ul className="list">
              {rot.map((t, i) => (
                <li className="row plan-row" key={t.id}>
                  <span className="slot">{letter(i)}</span>
                  <button className="body link-row" onClick={() => onEdit(t.id, loc)}>
                    <span className="name">{t.name}</span>
                    <span className="note">{t.items.length} 个动作</span>
                  </button>
                  <div className="pi-tools">
                    <button onClick={() => move(rot, i, -1)} disabled={i === 0} aria-label={`${t.name}上移`}>↑</button>
                    <button onClick={() => move(rot, i, 1)} disabled={i === rot.length - 1} aria-label={`${t.name}下移`}>↓</button>
                  </div>
                </li>
              ))}
              {others.map((t) => (
                <li className="row plan-row" key={t.id}>
                  <span className="slot muted">·</span>
                  <button className="body link-row" onClick={() => onEdit(t.id, loc)}>
                    <span className="name">{t.name}</span>
                    <span className="note">不在轮转 · {t.items.length} 个动作</span>
                  </button>
                </li>
              ))}
              {rot.length + others.length === 0 && <li className="empty">还没有{LOC_LABEL[loc]}计划。</li>}
            </ul>
            <button className="btn ghost" style={{ marginTop: 10 }} onClick={() => onEdit('new', loc)}>＋ 新建{LOC_LABEL[loc]}计划</button>
          </section>
        );
      })}
    </>
  );
}
