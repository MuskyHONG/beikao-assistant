import { useEffect, useRef, useState, type FormEvent } from 'react';
import { api, type Session } from './api';
import { Mascot } from './Mascot';
import { meetsPasswordRules, passwordMaxLength, passwordMinLength, passwordRules } from './passwordRules';

export function Login({ onLogin }: { onLogin: (session: Session) => void }) {
  const [registering, setRegistering] = useState(false);
  const [email, setEmail] = useState(''), [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState(''), [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const heading = useRef<HTMLHeadingElement>(null);
  const focusHeading = useRef(false);

  useEffect(() => {
    if (focusHeading.current) heading.current?.focus();
  }, [registering]);

  function switchForm(next: boolean) {
    focusHeading.current = true;
    setRegistering(next);
    setPassword('');
    setConfirmation('');
    setError('');
    setNotice('');
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setError('');
    if (registering) {
      if (!displayName.trim()) { setError('请填写显示姓名。'); return; }
      if (!meetsPasswordRules(password)) { setError(passwordRules); return; }
      if (password !== confirmation) { setError('两次输入的密码不一致。'); return; }
    }
    setBusy(true);
    try {
      if (registering) {
        const account = await api.request<{ email: string }>('/auth/register', 'POST', { email, displayName, password });
        switchForm(false);
        setEmail(account.email);
        setDisplayName('');
        setNotice('学员账号已创建，请使用刚设置的密码登录。');
      } else {
        const session = await api.request<Session>('/auth/login', 'POST', { email, password });
        onLogin(session);
      }
    } catch (error) { setError((error as Error).message); }
    finally { setBusy(false); }
  }
  return <main className="login-stage">
    <div className="login-art" aria-hidden="true">
      <Mascot animal="capybara" /><Mascot animal="hare" /><Mascot animal="badger" /><Mascot animal="beaver" />
    </div>
    <section className="panel login-card" aria-labelledby="auth-heading">
      <p className="login-brand">{registering ? '备考有方' : '把理解变成考场表达'}</p>
      <h1 id="auth-heading" tabIndex={-1} ref={heading}>{registering ? '注册学员账号' : '备考有方'}</h1>
      {notice && <p className="success-note" role="status">{notice}</p>}
      <form key={registering ? 'registration' : 'login'} className="editor-form login-form" onSubmit={submit}>
        {registering && <label>显示姓名<input name="displayName" autoComplete="name" value={displayName} onChange={event => setDisplayName(event.target.value)} required maxLength={80} disabled={busy} /></label>}
        <label>邮箱<input name="email" type="email" autoComplete="username" value={email} onChange={event => setEmail(event.target.value)} required maxLength={254} disabled={busy} /></label>
        <label>密码<input name="password" type="password" autoComplete={registering ? 'new-password' : 'current-password'} aria-describedby="auth-password-rules" value={password} onChange={event => setPassword(event.target.value)} required minLength={registering ? passwordMinLength : undefined} maxLength={passwordMaxLength} disabled={busy} /></label>
        <p id="auth-password-rules" className="small-copy muted auth-password-rules">{registering ? passwordRules : `新密码规则：${passwordRules}`}</p>
        {registering && <label>确认密码<input name="confirmPassword" type="password" autoComplete="new-password" value={confirmation} onChange={event => setConfirmation(event.target.value)} required maxLength={passwordMaxLength} disabled={busy} /></label>}
        {error && <p role="alert" className="warning-copy">{error}</p>}
        <button className="button" disabled={busy}>{registering ? (busy ? '正在注册…' : '创建学员账号') : (busy ? '正在登录…' : '登录')}</button>
      </form>
      <button type="button" className="button secondary auth-switch" onClick={() => switchForm(!registering)} disabled={busy}>
        {registering ? '返回登录' : '注册学员账号'}
      </button>
      {!registering && <p className="small-copy muted auth-help">忘记密码，请联系管理员。</p>}
    </section>
  </main>;
}
