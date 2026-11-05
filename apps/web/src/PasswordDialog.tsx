import { useEffect, useRef, useState, type FormEvent } from 'react';
import { api } from './api';
export function PasswordDialog({ onClose, onChanged }: { onClose: () => void; onChanged: () => void }) {
  const [currentPassword,setCurrent]=useState(''),[newPassword,setNew]=useState(''),[confirm,setConfirm]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const dialog=useRef<HTMLElement>(null);
  useEffect(()=>{const previous=document.activeElement as HTMLElement|null;const keydown=(event:KeyboardEvent)=>{
    if(event.key==='Escape'&&!busy){event.preventDefault();onClose();}
    if(event.key==='Tab'){const nodes=[...(dialog.current?.querySelectorAll<HTMLElement>('input,button:not([disabled])')??[])];const first=nodes[0],last=nodes.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}}
  };document.addEventListener('keydown',keydown);return()=>{document.removeEventListener('keydown',keydown);previous?.focus();};},[busy,onClose]);
  async function submit(event: FormEvent) {
    event.preventDefault();setError('');if(newPassword!==confirm){setError('两次输入的新密码不一致。');return;}setBusy(true);
    try{await api.request('/auth/password','POST',{currentPassword,newPassword});onChanged();}catch(error){setError((error as Error).message);}finally{setBusy(false);}
  }
  return <div className="modal-backdrop"><section ref={dialog} className="modal" role="dialog" aria-modal="true" aria-labelledby="password-title"><h2 id="password-title">修改密码</h2><p>修改后会退出此账号的全部登录会话，请使用新密码重新登录。</p><form className="editor-form" onSubmit={submit}>
    <label>当前密码<input autoFocus type="password" autoComplete="current-password" value={currentPassword} onChange={e=>setCurrent(e.target.value)} required maxLength={128}/></label>
    <label>新密码<input type="password" autoComplete="new-password" value={newPassword} onChange={e=>setNew(e.target.value)} minLength={12} maxLength={128} required/></label>
    <label>再次输入新密码<input type="password" autoComplete="new-password" value={confirm} onChange={e=>setConfirm(e.target.value)} minLength={12} maxLength={128} required/></label>
    {error&&<p className="warning-copy" role="alert">{error}</p>}<div className="button-row"><button className="button" disabled={busy}>{busy?'正在修改…':'确认修改'}</button><button type="button" className="button secondary" onClick={onClose} disabled={busy}>取消</button></div>
  </form></section></div>;
}
