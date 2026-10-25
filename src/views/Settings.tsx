import { useEffect, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { sync, type SyncState } from '../lib/sync';
import { exportCsv } from '../lib/csv';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../lib/db';

export function Settings({ sync: state, pending }: { sync: SyncState; pending: number }) {
  const [user, setUser] = useState<User | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [msg, setMsg] = useState<{ text: string; err?: boolean } | null>(null);
  const counts = useLiveQuery(async () => ({
    sessions: await db.sessions.filter((s) => !s.deleted).count(),
    sets: await db.sets.filter((s) => !s.deleted).count(),
  }), []);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getUser().then(({ data }) => setUser(data.user));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setUser(s?.user ?? null));
    return () => data.subscription.unsubscribe();
  }, []);

  /** Password login works inside the home-screen app; email links always open in Safari. */
  async function signIn() {
    if (!supabase) return;
    setMsg(null);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) setMsg({ text: `登录失败：${error.message}`, err: true });
    else { setMsg({ text: '已登录，正在同步。' }); setPassword(''); }
  }

  async function sendLink() {
    if (!supabase) return;
    setMsg(null);
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: `${location.origin}${import.meta.env.BASE_URL}` },
    });
    if (error) setMsg({ text: `发送失败：${error.message}`, err: true });
    else { setSent(true); setMsg({ text: '登录邮件已发送。点邮件里的链接，或输入邮件里的验证码。' }); }
  }

  async function verify() {
    if (!supabase) return;
    const { error } = await supabase.auth.verifyOtp({ email: email.trim(), token: code.trim(), type: 'email' });
    if (error) setMsg({ text: `验证码无效或已过期：${error.message}`, err: true });
    else { setMsg({ text: '已登录，正在同步。' }); setSent(false); setCode(''); }
  }

  return (
    <>
      <section className="section">
        <h2>账号与同步</h2>
        {!supabase && <p className="msg">这个版本没有配置 Supabase，数据只保存在这台设备上。定期导出 CSV 做备份。</p>}
        {supabase && user && (
          <div className="stack">
            <div className="kv"><span>已登录</span><span>{user.email}</span></div>
            <div className="kv"><span>同步状态</span><span>{state.status === 'error' ? `出错：${state.message}` : state.at ? `上次同步 ${new Date(state.at).toLocaleString()}` : '—'}</span></div>
            <div className="kv"><span>待上传</span><span>{pending} 条</span></div>
            <button className="btn ghost" onClick={() => sync()}>立即同步</button>
            <button className="btn quiet" onClick={() => supabase!.auth.signOut()}>退出登录</button>
          </div>
        )}
        {supabase && !user && (
          <div className="stack">
            <p className="msg">登录后，记录会同步到云端，换手机或清除浏览器数据也不会丢。没登录时照常记录，登录后自动上传。</p>
            <input className="field" type="email" autoComplete="email" placeholder="邮箱" value={email} onChange={(e) => setEmail(e.target.value)} />
            <input className="field" type="password" autoComplete="current-password" placeholder="密码" value={password}
              onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && signIn()} />
            <button className="btn" onClick={signIn} disabled={!email.includes('@') || !password}>登录</button>
            <button className="btn quiet" onClick={sendLink} disabled={!email.includes('@')}>没有密码？发送登录邮件</button>
            {sent && (
              <>
                <input className="field code" inputMode="numeric" autoComplete="one-time-code" placeholder="验证码" value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 10))} />
                <button className="btn ghost" onClick={verify} disabled={code.length < 6}>用验证码登录</button>
              </>
            )}
          </div>
        )}
        {msg && <p className={`msg${msg.err ? ' err' : ''}`}>{msg.text}</p>}
      </section>

      <section className="section">
        <h2>数据</h2>
        <div className="kv"><span>训练次数</span><span>{counts?.sessions ?? '–'}</span></div>
        <div className="kv"><span>记录组数</span><span>{counts?.sets ?? '–'}</span></div>
        <div className="section"><button className="btn ghost" onClick={exportCsv}>导出 CSV</button></div>
      </section>
    </>
  );
}
