import { useEffect, useState, type FormEvent } from 'react';
import { api, type User } from './api';
const roleNames = { learner: '学员', maintainer: '维护者', admin: '管理员' };
export function Accounts({ currentUser }: { currentUser: User }) {
  const [items, setItems] = useState<User[]>([]), [error, setError] = useState(''), [busy, setBusy] = useState(false), [notice, setNotice] = useState('');
  const [email, setEmail] = useState(''), [displayName, setName] = useState(''), [password, setPassword] = useState(''), [role, setRole] = useState<User['role']>('learner');
  const refresh = async () => setItems((await api.request<{ items: User[] }>('/admin/users')).items);
  useEffect(() => { void refresh().catch(error => setError(error.message)); }, []);
  async function create(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(''); setNotice('');
    try { await api.request('/admin/users', 'POST', { email, displayName, password, role }); setPassword(''); setEmail(''); setName(''); await refresh(); setNotice('账号已创建，请通过你认可的方式向该用户提供登录信息。'); }
    catch (error) { setError((error as Error).message); }
    finally { setBusy(false); }
  }
  async function toggle(user: User) {
    setBusy(true); setError('');
    try { await api.request('/admin/users/' + user.id, 'PATCH', { enabled: !user.enabled }); await refresh(); }
    catch (error) { setError((error as Error).message); }
    finally { setBusy(false); }
  }
  return <><div className="page-heading"><div><h1>账号管理</h1><p>学员访问学习内容；维护者维护题库；管理员另外管理账号。</p></div></div>
    {error && <p className="warning-copy" role="alert">{error}</p>}{notice && <p className="success-note" role="status">{notice}</p>}
    <div className="admin-editor-grid"><section className="panel"><h2>账号列表</h2><p className="small-copy muted">最近创建的200个账号；停用会立即撤销该账号的登录会话。</p>{items.map(user => <div className="account-row" key={user.id}><div><strong>{user.displayName}</strong><p>{user.email} · {roleNames[user.role]} · {user.enabled ? '可用' : '已停用'}</p></div><button className="button secondary small" disabled={busy || user.id === currentUser.id} onClick={() => void toggle(user)}>{user.enabled ? '停用' : '启用'}</button></div>)}</section>
    <form className="panel editor-form" onSubmit={create}><h2>开通账号</h2><label>姓名<input value={displayName} onChange={e => setName(e.target.value)} required maxLength={80} /></label><label>邮箱<input type="email" autoComplete="off" value={email} onChange={e => setEmail(e.target.value)} required maxLength={254} /></label><label>初始密码<input type="password" autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)} minLength={12} maxLength={128} required /></label><label>角色<select value={role} onChange={e => setRole(e.target.value as User['role'])}>{Object.entries(roleNames).map(([key,label]) => <option key={key} value={key}>{label}</option>)}</select></label><button className="button" disabled={busy}>{busy ? '处理中…' : '创建账号'}</button><p className="small-copy muted">密码至少12位；不会通过此页面发送邮件或短信。</p></form></div></>;
}
