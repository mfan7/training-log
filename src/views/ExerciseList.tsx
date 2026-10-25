import { useState } from 'react';
import { allExercises, GROUP_ORDER } from '../lib/data';
import type { Exercise } from '../lib/types';

/** Search + group filter + home-only toggle, shared by the library and the picker. */
export function ExerciseList({ initialGroup, homeOnly: initialHome = false, taken, onSelect, onCreate }: {
  initialGroup?: string; homeOnly?: boolean; onSelect: (e: Exercise) => void;
  /** shows a "new exercise" button; gets the current search text as a starting name */
  onCreate?: (name: string) => void;
  /** exercises already in the workout: shown but not selectable */
  taken?: Set<string>;
}) {
  const [q, setQ] = useState('');
  const [group, setGroup] = useState<string | undefined>(initialGroup);
  const [homeOnly, setHomeOnly] = useState(initialHome);

  // not memoised: custom exercises can change underneath, and filtering ~120 rows is cheap
  const s = q.trim().toLowerCase();
  const items = allExercises().filter((e) =>
    (!group || e.group === group) && (!homeOnly || e.home) &&
    (!s || e.cn.includes(s) || e.en.toLowerCase().includes(s) || e.id.toLowerCase().includes(s) || e.muscles.includes(s)),
  );

  return (
    <>
      <input className="search" type="search" placeholder="搜索动作、肌群或英文名" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="chips" role="group" aria-label="部位">
        <button aria-pressed={!group} onClick={() => setGroup(undefined)}>全部</button>
        {GROUP_ORDER.map((g) => (
          <button key={g} aria-pressed={group === g} onClick={() => setGroup(group === g ? undefined : g)} data-g={g}>
            <span className="mark" aria-hidden />{g}
          </button>
        ))}
      </div>
      <label className="toggle">
        <input type="checkbox" checked={homeOnly} onChange={(e) => setHomeOnly(e.target.checked)} /> 只看在家能做的
      </label>
      {onCreate && (
        <button className="btn ghost small-full" onClick={() => onCreate(q.trim())}>
          ＋ 新建动作{q.trim() ? `「${q.trim()}」` : ''}
        </button>
      )}
      <ul className="list">
        {items.map((e) => (
          <li key={e.id} data-g={e.group}>
            <button className="row-btn" onClick={() => onSelect(e)} disabled={taken?.has(e.id)}>
              <span className="mark" aria-hidden style={{ marginTop: 5 }} />
              <span className="body" style={{ flex: 1 }}>
                <span className="name" style={{ display: 'block', fontWeight: 600 }}>{e.cn}</span>
                <span className="en" style={{ display: 'block', color: 'var(--muted)', fontSize: 13 }}>{e.en}</span>
              </span>
              <span className="tag">{taken?.has(e.id) ? '已在计划中' : e.custom ? '自定义' : e.home ? '可在家' : e.equip}</span>
            </button>
          </li>
        ))}
        {items.length === 0 && <li className="empty">没有符合条件的动作，换个关键词或取消筛选。</li>}
      </ul>
    </>
  );
}
