import { useCallback, useEffect, useState } from 'react';
import { App } from './App.jsx';
import { Accounts } from './Accounts';
import { Login } from './Login';
import { PasswordDialog } from './PasswordDialog';
import { ApiError, api, groupBank, loadBank, questionPayload, type BankItem, type Session } from './api';

export function ProductionApp() {
  const [session, setSession] = useState<Session | null>(null), [loading, setLoading] = useState(true), [error, setError] = useState('');
  const [learnerBank, setLearnerBank] = useState<BankItem[] | null>(null), [adminBank, setAdminBank] = useState<BankItem[]>([]);
  const [passwordDialog,setPasswordDialog]=useState(false);
  const acceptSession = useCallback((value: Session) => { api.csrf = value.csrfToken; setSession(value); setError(''); }, []);
  useEffect(() => {
    let active = true;
    api.request<Session>('/auth/me').then(value => { if (active) acceptSession(value); }).catch(error => { if (active && !(error instanceof ApiError && error.status === 401)) setError(error.message); }).finally(() => { if (active) setLoading(false); });
    const expired = () => { api.csrf = ''; setSession(null); setLearnerBank(null); setAdminBank([]); };
    window.addEventListener('beikao:session-expired', expired);
    return () => { active = false; window.removeEventListener('beikao:session-expired', expired); };
  }, [acceptSession]);
  const refresh = useCallback(async () => {
    if (!session) return;
    const [learners, admins] = await Promise.all([loadBank(), session.user.role === 'learner' ? Promise.resolve([]) : loadBank(true)]);
    if (api.csrf !== session.csrfToken) return;
    setLearnerBank(learners); setAdminBank(admins); setError('');
  }, [session]);
  useEffect(() => {
    if (!session) return;
    void refresh().catch(error => setError(error.message));
    const update = () => { void refresh().catch(error => setError(error.message)); };
    const timer = window.setInterval(update, 60000);
    window.addEventListener('focus', update); window.addEventListener('hashchange', update);
    return () => { clearInterval(timer); window.removeEventListener('focus', update); window.removeEventListener('hashchange', update); };
  }, [session, refresh]);
  const saveQuestion = async (q: BankItem) => {
    await api.request('/admin/questions/' + encodeURIComponent(q.id), 'PUT', { content: questionPayload(q), expectedRevision: q.etag ?? 0, action: q.status === 'published' ? 'publish' : 'draft' });
    await refresh();
  };
  const changeStatus = async (q: BankItem, status: string) => {
    await api.request('/admin/questions/' + encodeURIComponent(q.id) + '/status', 'POST', { action: status === 'published' ? 'publish' : 'archive', expectedRevision: q.etag });
    await refresh();
  };
  const checkQuestion = (q: BankItem, response: string) => api.request('/questions/' + encodeURIComponent(q.id) + '/check', 'POST', { version: q.version, response });
  const logout = async () => { await api.request('/auth/logout', 'POST'); api.csrf = ''; setSession(null); setLearnerBank(null); setAdminBank([]); };
  if (loading) return <main className="login-page"><section className="panel"><p role="status">正在连接学习空间…</p></section></main>;
  if (!session) return <>{error && <div className="connection-error" role="alert">{error}<button className="button secondary small" onClick={() => location.reload()}>重新连接</button></div>}<Login onLogin={acceptSession} /></>;
  if (!learnerBank) return <main className="login-page"><section className="panel"><h2>正在载入共享题库</h2>{error && <p role="alert">{error}</p>}<button className="button" onClick={() => void refresh().catch(error => setError(error.message))}>重新载入</button><button className="button secondary" onClick={() => void logout().catch(error => setError(error.message))}>退出登录</button></section></main>;
  return <>{error && <div className="connection-error" role="alert">{error}<button className="button secondary small" onClick={() => void refresh().catch(error => setError(error.message))}>刷新题库</button></div>}
    <App key={session.user.id} user={session.user} learnerBank={groupBank(learnerBank)} adminBank={groupBank(adminBank)} saveQuestion={saveQuestion} changeStatus={changeStatus} checkQuestion={checkQuestion} onLogout={logout} onPassword={()=>setPasswordDialog(true)} accountsPanel={<Accounts currentUser={session.user} />} />
    {passwordDialog&&<PasswordDialog onClose={()=>setPasswordDialog(false)} onChanged={()=>{api.csrf='';setPasswordDialog(false);setSession(null);setLearnerBank(null);setAdminBank([]);setError('密码已更新，请使用新密码重新登录。');}}/>}
  </>;
}
