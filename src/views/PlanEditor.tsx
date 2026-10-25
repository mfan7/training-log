import { useEffect, useState } from 'react';
import { db, putTemplate, uid } from '../lib/db';
import { ex, LOC_LABEL } from '../lib/data';
import type { Loc, PlanItem, Template } from '../lib/types';
import { Picker } from './Picker';

type Draft = { name: string; loc: Loc; rotation: boolean; items: PlanItem[]; link: boolean[] };

/** Superset labels → "linked to the item above" flags, and back. */
const toLinks = (items: PlanItem[]) => items.map((it, i) => i > 0 && !!it.ss && it.ss === items[i - 1].ss);
function withSupersets(items: PlanItem[], link: boolean[]): PlanItem[] {
  const out = items.map(({ ss: _s, ...it }) => it as PlanItem);
  let n = 0;
  for (let i = 1; i < out.length; i++) {
    if (!link[i]) continue;
    out[i - 1].ss ??= `超级组${++n}`;
    out[i].ss = out[i - 1].ss;
  }
  return out;
}

/** Create or edit a plan: its name, place, whether it rotates, and each exercise's sets, reps and rest. */
export function PlanEditor({ id, loc: initialLoc, onDone }: { id: string | 'new'; loc: Loc; onDone: () => void }) {
  const [orig, setOrig] = useState<Template | null>(null);
  const [d, setD] = useState<Draft | null>(null);
  const [picker, setPicker] = useState<{ index?: number } | null>(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (id === 'new') { setD({ name: '', loc: initialLoc, rotation: true, items: [], link: [] }); return; }
    db.templates.get(id).then((t) => {
      if (!t) { onDone(); return; }
      setOrig(t);
      setD({ name: t.name, loc: t.loc, rotation: t.rotation, items: t.items, link: toLinks(t.items) });
    });
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!d) return null;
  const set = (patch: Partial<Draft>) => setD({ ...d, ...patch });
  const setItem = (i: number, patch: Partial<PlanItem>) => set({ items: d.items.map((it, j) => (j === i ? { ...it, ...patch } : it)) });
  function move(i: number, by: number) {
    const j = i + by;
    if (j < 0 || j >= d!.items.length) return;
    const items = d!.items.slice(); [items[i], items[j]] = [items[j], items[i]];
    const link = d!.link.slice(); [link[i], link[j]] = [link[j], link[i]];
    link[0] = false;
    set({ items, link });
  }
  function remove(i: number) {
    const items = d!.items.filter((_, j) => j !== i);
    const link = d!.link.filter((_, j) => j !== i);
    if (link.length) link[0] = false;
    set({ items, link });
  }

  async function save() {
    const name = d!.name.trim();
    if (!name) { setErr('给计划起个名字，比如「胸 + 三头」'); return; }
    const bad = d!.items.find((it) => it.sets < 1 || it.min < 1 || it.max < it.min);
    if (bad) { setErr(`「${ex(bad.ex).cn}」的组数或次数不对：最多次数不能少于最少次数`); return; }
    let position = orig?.position ?? 0;
    if (!orig || orig.loc !== d!.loc || (!orig.rotation && d!.rotation)) {
      // join the end of this place's rotation
      const same = (await db.templates.toArray()).filter((t) => !t.deleted && t.loc === d!.loc && t.id !== orig?.id);
      position = same.reduce((m, t) => Math.max(m, t.position + 1), 0);
    }
    await putTemplate({
      id: orig?.id ?? uid(), name, loc: d!.loc, rotation: d!.rotation, position,
      items: withSupersets(d!.items, d!.link), deleted: false,
    });
    onDone();
  }

  async function del() {
    if (!orig || !confirm(`删除计划「${orig.name}」？已记录的训练不受影响。`)) return;
    await putTemplate({ ...orig, deleted: true });
    onDone();
  }

  return (
    <>
      <div className="backbar"><button onClick={onDone}>‹ 取消</button></div>
      <h1 className="page-title">{orig ? '编辑计划' : '新建计划'}</h1>

      <div className="stack">
        <label className="lbl">
          <span>名称</span>
          <input className="field" value={d.name} placeholder="例如：胸 + 三头" onChange={(e) => set({ name: e.target.value })} />
        </label>
        <div className="seg" role="group" aria-label="地点">
          {(['gym', 'home'] as Loc[]).map((l) => (
            <button key={l} aria-pressed={d.loc === l} onClick={() => set({ loc: l })}>{LOC_LABEL[l]}</button>
          ))}
        </div>
        <label className="toggle">
          <input type="checkbox" checked={d.rotation} onChange={(e) => set({ rotation: e.target.checked })} />
          参加每周轮转（不勾选：只在「本周重点」里手动选）
        </label>
      </div>

      <h2 className="sub-title">动作（{d.items.length}）</h2>
      {d.items.length === 0 && <p className="empty">还没有动作。</p>}
      <ol className="plan-items">
        {d.items.map((it, i) => {
          const e = ex(it.ex);
          return (
            <li key={`${it.ex}-${i}`} data-g={e.group} className={d.link[i] ? 'linked' : ''}>
              <div className="pi-head">
                <span className="mark" aria-hidden />
                <button className="pi-name" onClick={() => setPicker({ index: i })} title="换动作">
                  {e.cn}<small>{e.en}</small>
                </button>
                <div className="pi-tools">
                  <button onClick={() => move(i, -1)} disabled={i === 0} aria-label="上移">↑</button>
                  <button onClick={() => move(i, 1)} disabled={i === d.items.length - 1} aria-label="下移">↓</button>
                  <button onClick={() => remove(i)} aria-label={`删除${e.cn}`}>✕</button>
                </div>
              </div>
              <div className="pi-nums">
                <Num label="组" value={it.sets} onChange={(v) => setItem(i, { sets: v })} />
                <Num label={e.load === 'sec' ? '最少秒' : '最少次'} value={it.min} onChange={(v) => setItem(i, { min: v })} />
                <Num label={e.load === 'sec' ? '最多秒' : '最多次'} value={it.max} onChange={(v) => setItem(i, { max: v })} />
                <Num label="休息秒" value={it.rest} onChange={(v) => setItem(i, { rest: v })} />
              </div>
              {i > 0 && (
                <label className="toggle small">
                  <input type="checkbox" checked={d.link[i]} onChange={(ev) => set({ link: d.link.map((l, j) => (j === i ? ev.target.checked : l)) })} />
                  和上一个动作组成超级组（交替做）
                </label>
              )}
            </li>
          );
        })}
      </ol>
      <button className="btn ghost" onClick={() => setPicker({})}>＋ 添加动作</button>

      {err && <p className="msg err">{err}</p>}
      <div className="stack section">
        <button className="btn" onClick={save}>保存计划</button>
        {orig && <button className="btn quiet" onClick={del}>删除这个计划</button>}
      </div>

      {picker && (
        <Picker
          loc={d.loc}
          title={picker.index !== undefined ? '换成其他动作' : '添加动作'}
          group={picker.index !== undefined ? ex(d.items[picker.index].ex).group : undefined}
          taken={new Set(d.items.map((x) => x.ex))}
          onClose={() => setPicker(null)}
          onPick={(exId) => {
            if (picker.index !== undefined) setItem(picker.index, { ex: exId });
            else {
              const e = ex(exId);
              const item: PlanItem = e.load === 'sec'
                ? { ex: exId, sets: 3, min: 30, max: 45, rest: 45 }
                : { ex: exId, sets: 3, min: 8, max: 12, rest: e.size === '大' ? 90 : 60 };
              set({ items: [...d.items, item], link: [...d.link, false] });
            }
            setPicker(null);
          }}
        />
      )}
    </>
  );
}

function Num({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <label className="num">
      <span>{label}</span>
      <input type="number" inputMode="numeric" min={0} value={value}
        onChange={(e) => onChange(Math.max(0, Math.round(Number(e.target.value) || 0)))} />
    </label>
  );
}
