import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from './lib/db';
import { getSyncState, onSyncState, type SyncState } from './lib/sync';
import { Today } from './views/Today';
import { Workout } from './views/Workout';
import { Library } from './views/Library';
import { Settings } from './views/Settings';
import { SessionDetail } from './views/SessionDetail';
import { PlanEditor } from './views/PlanEditor';
import { Plans } from './views/Plans';
import { Results } from './views/Results';
import { setCustomExercises } from './lib/data';
import type { Loc } from './lib/types';

type Tab = 'today' | 'results' | 'library' | 'settings';

function useSync(): SyncState {
  const [s, set] = useState(getSyncState());
  useEffect(() => onSyncState(set), []);
  return s;
}

const SYNC_LABEL: Record<SyncState['status'], string> = {
  off: '仅本机', 'signed-out': '未登录', idle: '已同步', syncing: '同步中', offline: '离线', error: '同步出错',
};

export function App() {
  const [tab, setTab] = useState<Tab>('today');
  const [openId, setOpenId] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [editPlan, setEditPlan] = useState<{ id: string | 'new'; loc: Loc } | null>(null);
  const [plans, setPlans] = useState(false);
  const custom = useLiveQuery(() => db.exercises.toArray(), []);
  if (custom) setCustomExercises(custom); // before any child looks exercises up
  const sync = useSync();
  const active = useLiveQuery(() => db.sessions.filter((s) => !s.deleted && !s.ended_at).first(), []);

  // Resume an unfinished workout after reload
  useEffect(() => { if (active && openId === null) setOpenId(active.id); }, [active?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const pending = useLiveQuery(async () => (await db.sessions.where('dirty').equals(1).count()) + (await db.sets.where('dirty').equals(1).count()), []) ?? 0;
  const syncClass = sync.status === 'idle' ? 'ok' : sync.status === 'syncing' ? 'busy' : sync.status === 'error' ? 'err' : '';

  if (openId) {
    return <div className="app"><Workout sessionId={openId} onClose={() => { setOpenId(null); setTab('today'); }} /></div>;
  }
  if (editPlan) {
    return <div className="app"><PlanEditor key={editPlan.id} id={editPlan.id} loc={editPlan.loc} onDone={() => setEditPlan(null)} /></div>;
  }
  if (plans) {
    return <div className="app"><Plans onBack={() => setPlans(false)} onEdit={(id, loc) => setEditPlan({ id, loc })} /></div>;
  }
  if (detailId) {
    return <div className="app"><SessionDetail id={detailId} onBack={() => setDetailId(null)} onEdit={setOpenId} /></div>;
  }

  return (
    <div className="app">
      <header className="top">
        <h1>训练记录</h1>
        <button className={`sync ${syncClass}`} onClick={() => setTab('settings')}>
          <i aria-hidden />{SYNC_LABEL[sync.status]}{pending > 0 && sync.status !== 'idle' && sync.status !== 'off' ? `（${pending} 条待上传）` : ''}
        </button>
      </header>
      {tab === 'today' && (
        <Today onOpen={setOpenId} onEditPlan={(id, loc) => setEditPlan({ id, loc })} onPlans={() => setPlans(true)} />
      )}
      {tab === 'results' && <Results onDetail={setDetailId} />}
      {tab === 'library' && <Library />}
      {tab === 'settings' && <Settings sync={sync} pending={pending} />}
      <div className="tabs">
        <nav>
          {([['today', '今天'], ['results', '成果'], ['library', '动作库'], ['settings', '设置']] as const).map(([k, label]) => (
            <button key={k} aria-current={tab === k ? 'page' : undefined} onClick={() => setTab(k)}>{label}</button>
          ))}
        </nav>
      </div>
    </div>
  );
}
