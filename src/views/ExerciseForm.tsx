import { useState } from 'react';
import { putExercise, uid } from '../lib/db';
import { GROUP_ORDER } from '../lib/data';
import type { Exercise, Load } from '../lib/types';
import { Sheet } from './ExerciseSheet';

const EQUIP = ['器械', '哑铃', '杠铃', '绳索', '壶铃', '弹力带', '自重', '垫子', '其他'];
const LOADS: [Load, string][] = [['lb', '记重量（lb）'], ['bw', '自重（可加负重）'], ['sec', '计时（秒）'], ['level', '辅助档位']];

/** Add or edit one of your own exercises. Calls onSaved with its id. */
export function ExerciseForm({ initial, initialName = '', onSaved, onClose }: {
  initial?: Exercise; initialName?: string; onSaved: (id: string) => void; onClose: () => void;
}) {
  const [f, setF] = useState({
    cn: initial?.cn ?? initialName, en: initial?.en ?? '', group: initial?.group || '胸',
    equip: initial?.equip || '器械', load: initial?.load ?? ('lb' as Load), inc: initial?.inc ?? 5,
    home: initial?.home ?? false, muscles: initial?.muscles ?? '', cue: initial?.cue ?? '',
  });
  const [err, setErr] = useState('');
  const set = (patch: Partial<typeof f>) => setF({ ...f, ...patch });

  async function save() {
    const cn = f.cn.trim();
    if (!cn) { setErr('请填写动作名称'); return; }
    const id = initial?.id ?? `U-${uid()}`;
    await putExercise({
      id, cn, en: f.en.trim(), group: f.group, equip: f.equip, load: f.load, inc: f.inc || 5,
      home: f.home, muscles: f.muscles.trim(), cue: f.cue.trim(),
      cat: '', catName: '自定义', size: '', homeNote: '', legacy: [], custom: true, deleted: false,
    });
    onSaved(id);
  }

  return (
    <Sheet onClose={onClose} label={initial ? '编辑动作' : '新建动作'}>
      <h2>{initial ? '编辑动作' : '新建动作'}</h2>
      <div className="stack form">
        <label className="lbl"><span>中文名称</span>
          <input className="field" value={f.cn} placeholder="例如：上斜推胸机" onChange={(e) => set({ cn: e.target.value })} />
        </label>
        <label className="lbl"><span>英文名称（可不填）</span>
          <input className="field" value={f.en} placeholder="Incline chest press machine" onChange={(e) => set({ en: e.target.value })} />
        </label>
        <div className="grid2">
          <label className="lbl"><span>部位</span>
            <select className="field" value={f.group} onChange={(e) => set({ group: e.target.value })}>
              {GROUP_ORDER.map((g) => <option key={g}>{g}</option>)}
            </select>
          </label>
          <label className="lbl"><span>器材</span>
            <select className="field" value={f.equip} onChange={(e) => set({ equip: e.target.value })}>
              {EQUIP.map((x) => <option key={x}>{x}</option>)}
            </select>
          </label>
        </div>
        <label className="lbl"><span>怎么记录</span>
          <select className="field" value={f.load} onChange={(e) => set({ load: e.target.value as Load })}>
            {LOADS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </label>
        {f.load === 'lb' && (
          <label className="lbl"><span>每次加重（lb）</span>
            <input className="field" type="number" inputMode="decimal" value={f.inc} onChange={(e) => set({ inc: Number(e.target.value) || 0 })} />
          </label>
        )}
        <label className="toggle">
          <input type="checkbox" checked={f.home} onChange={(e) => set({ home: e.target.checked })} /> 在家能做
        </label>
        <label className="lbl"><span>主要肌群（可不填）</span>
          <input className="field" value={f.muscles} placeholder="上胸、三角肌前束" onChange={(e) => set({ muscles: e.target.value })} />
        </label>
        <label className="lbl"><span>动作要点（可不填）</span>
          <textarea className="field" rows={3} value={f.cue} onChange={(e) => set({ cue: e.target.value })} />
        </label>
        {err && <p className="msg err">{err}</p>}
        <button className="btn" onClick={save}>保存</button>
      </div>
    </Sheet>
  );
}
