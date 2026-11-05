import { useState, type FormEvent } from 'react';
import { api, type Session } from './api';

export function Login({ onLogin }: { onLogin: (session: Session) => void }) {
  const [email, setEmail] = useState(''), [password, setPassword] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('');
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    try { const session = await api.request<Session>('/auth/login', 'POST', { email, password }); setPassword(''); onLogin(session); }
    catch (error) { setError((error as Error).message); }
    finally { setBusy(false); }
  }
  return <main className="login-page"><section className="panel login-card"><a className="brand" href="#/home">备考有方<span>把理解变成考场表达</span></a><h1>登录学习空间</h1><p className="muted">使用管理员为你开通的账号。维护人员登录后可进入内容工作台。</p><form className="editor-form" onSubmit={submit}>
    <label>邮箱<input name="email" type="email" autoComplete="username" value={email} onChange={e => setEmail(e.target.value)} required maxLength={254} /></label>
    <label>密码<input name="password" type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} required maxLength={128} /></label>
    {error && <p role="alert" className="warning-copy">{error}</p>}<button className="button" disabled={busy}>{busy ? '正在登录…' : '登录'}</button>
  </form><p className="small-copy muted">尚无账号或需要重置密码，请联系管理员。首次管理员由服务器初始化命令创建。</p></section></main>;
}
