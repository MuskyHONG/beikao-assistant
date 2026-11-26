import { useState, type FormEvent } from 'react';
import { api, type Session } from './api';
import { Mascot } from './Mascot';

export function Login({ onLogin }: { onLogin: (session: Session) => void }) {
  const [email, setEmail] = useState(''), [password, setPassword] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('');
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const session = await api.request<Session>('/auth/login', 'POST', { email, password });
      setPassword(''); onLogin(session);
    } catch (error) { setError((error as Error).message); }
    finally { setBusy(false); }
  }
  return <main className="login-stage">
    <div className="login-art" aria-hidden="true">
      <Mascot animal="capybara" /><Mascot animal="hare" /><Mascot animal="badger" /><Mascot animal="beaver" />
    </div>
    <section className="panel login-card">
      <p className="login-brand">把理解变成考场表达</p>
      <h1>备考有方</h1>
      <form className="editor-form login-form" onSubmit={submit}>
        <label>邮箱<input name="email" type="email" autoComplete="username" value={email} onChange={event => setEmail(event.target.value)} required maxLength={254} /></label>
        <label>密码<input name="password" type="password" autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} required maxLength={128} /></label>
        {error && <p role="alert" className="warning-copy">{error}</p>}
        <button className="button" disabled={busy}>{busy ? '正在登录…' : '登录'}</button>
      </form>
      <p className="small-copy muted">开通账号或重置密码，请联系管理员。</p>
    </section>
  </main>;
}
