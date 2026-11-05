import React, { useEffect, useState } from 'react';
import { levels } from './data.js';
import { answerLabel, assessQuestion, fillValues, hasResponse, kinds, masteryStatus, questionSnapshot } from './questionBank.js';
const go = path => { location.hash = path; };
const date = value => new Date(value).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });

export function ResponseFields({ question: q, value, onChange, labelPrefix = '' }) {
  if (q.kind === 'choice') {
    const selected = (value || '').split(',').filter(Boolean);
    return <fieldset className="answer-fieldset"><legend>{q.multiple ? '选择所有符合要求的选项' : '选择一个答案'}</legend><div className="options">{(q.choices || []).map(c => <label key={c.id} className={'option ' + (selected.includes(c.id) ? 'checked' : '')}><input type={q.multiple ? 'checkbox' : 'radio'} name={labelPrefix + q.id} checked={selected.includes(c.id)} onChange={e => onChange(q.multiple ? (e.target.checked ? [...selected, c.id] : selected.filter(x => x !== c.id)).sort().join(',') : c.id)} /><span>{c.id}. {c.text || '待填写选项'}</span></label>)}</div></fieldset>;
  }
  if (q.kind === 'judgment') return <fieldset className="answer-fieldset"><legend>判断这句话是否正确</legend><div className="judgment-options">{['正确', '错误'].map(c => <label key={c} className={'option ' + (value === c ? 'checked' : '')}><input type="radio" name={labelPrefix + q.id} checked={value === c} onChange={() => onChange(c)} />{c}</label>)}</div></fieldset>;
  if (q.kind === 'fill') {
    const values = fillValues(value, q.blanks?.length || 1);
    return <fieldset className="answer-fieldset"><legend>按题干的空号填写答案</legend><div className="fill-inputs">{values.map((v, i) => <label key={i}>第 {i + 1} 空<input aria-label={labelPrefix + '第' + (i + 1) + '空答案'} value={v} onChange={e => { const next = [...values]; next[i] = e.target.value; onChange(JSON.stringify(next)); }} placeholder="填写答案" /></label>)}</div></fieldset>;
  }
  return <><label className="answer-label" htmlFor={labelPrefix + 'practice-answer'}>先不看参考，写下你的回答</label><textarea id={labelPrefix + 'practice-answer'} value={value || ''} onChange={e => onChange(e.target.value)} rows={7} placeholder="可以先写支点，再逐点展开。暂时想不起来也可以如实记录。" /></>;
}

export function ReferenceContent({ question: q, draft, assessment }) {
  const result = assessment || assessQuestion(q, draft);
  return <div className="reference-content">
    {q.kind !== 'short' && result.state !== 'empty' && <div className={'answer-result ' + result.state}><strong>{result.state === 'correct' ? '参考核对：回答正确' : result.state === 'partial' ? '参考核对：部分正确' : '参考核对：需要修正'}</strong><span>本次参考得分 {result.score} / {q.max}</span><p>按维护者设置的答案核对，不会自动修改掌握颜色。</p></div>}
    <h3>{q.kind === 'short' ? '参考答案' : '正确答案'}</h3>
    {q.kind === 'choice' ? <p>{(q.correctIds || []).map(id => id + '. ' + (q.choices.find(c => c.id === id)?.text || '')).join('；') || '待设置'}</p> : q.kind === 'judgment' ? <p>{q.correct || '待设置'}</p> : q.kind === 'fill' ? <ol>{(q.blanks || []).map((b, i) => <li key={i}>第 {i + 1} 空：{b.accepted.join(' / ') || '待设置'}{result.matches && <span className="muted"> · {result.matches[i] ? '符合参考答案' : '未匹配，可对照复核'}</span>}</li>)}</ol> : <p className="preserve">{q.referenceAnswer}</p>}
    {q.explanation && <><h3>答案解析</h3><p className="preserve">{q.explanation}</p></>}
    {q.kind === 'fill' && <p className="small-copy muted">忽略前后及中间空格、英文大小写和全半角差异；仅匹配维护者列出的可接受答案，其他表述须人工复核。</p>}
  </div>;
}

export function BankPractice({ question: q, record, practice, update, openQuestion, notify, help, checkQuestion }) {
  const outdated = record && (record.questionVersion || 1) !== (q?.version || 1);
  const [draft, setDraft] = useState(outdated ? '' : record?.draft || ''), [reference, setReference] = useState(null), [checked, setChecked] = useState([]), [rated, setRated] = useState(null),[checking,setChecking]=useState(false);
  useEffect(() => { if (q && (!record || outdated)) {update(q.id, { status: 'pending', draft: '', attempts: record?.attempts || [], questionVersion: q.version || 1, previousDrafts:[...(record?.previousDrafts||[]),...(outdated&&record.draft?[{answer:record.draft,version:record.questionVersion,snapshot:record.draftSnapshot,at:Date.now()}]:[])] });if(outdated)notify('题目已更新，请重新作答；旧版草稿与练习历史已保留。');} }, []);
  if (!q) return <section className="panel empty"><h2>这道题未发布或已下架</h2><p>题库会更新，已有作答记录仍保存在当前浏览器。</p><button className="button" onClick={() => go('/practice')}>返回题目列表</button></section>;
  const save = value => { setDraft(value);setReference(null);setChecked([]);setRated(null); update(q.id, { draft: value, draftSnapshot:questionSnapshot(q), questionVersion: q.version || 1 }); };
  const check = async()=>{if(checking)return;if(!hasResponse(q,draft))return notify('请先作答，再对照参考。');setChecking(true);try{setReference({...await checkQuestion(q,draft),response:draft});}catch(error){notify(error.message);}finally{setChecking(false);}};
  const rate = status => {
    if (!hasResponse(q, draft)||!reference||reference.response!==draft) return notify('请先留下回答并核对参考。');
    update(q.id, { status, draft, questionVersion: q.version || 1, attempts: [...(record?.attempts || []), { at: Date.now(), answer: draft, answerText: answerLabel(q, draft), status, checked: [...checked], assessment: reference.assessment, questionSnapshot: questionSnapshot(reference.question) }] });
    setRated(status); notify('已保存本次作答和掌握自评');
  };
  const kind = kinds[q.kind], prompt = q.kind === 'fill' ? q.prompt.replace(/\{\{(\d+)\}\}/g, (_, n) => `____（第 ${n} 空）`) : q.prompt;
  return <><div className="page-heading"><div><h1>{q.isVariant ? '关联变式' : kind + '练习'}</h1><p>选择题目后作答，对照参考，再由你确认掌握程度。</p></div><button className="button secondary" onClick={() => go('/practice')}>返回题目列表</button></div>
    <div className="two-col"><div className="stack"><section className="panel"><div className="section-caption"><span className="tag">{kind}{q.kind === 'choice' ? q.multiple ? ' · 多选' : ' · 单选' : ''}</span><span className="tag">{q.sourceType}</span><span className={'tag ' + masteryStatus(record, q)}>{levels[masteryStatus(record, q)].label}</span><span className="tag">v{q.version || 1} · {q.max} 分</span></div><h2 className="question-title">{q.title}</h2>{q.title !== prompt && <p className="large-copy">{prompt}</p>}<ResponseFields question={q} value={draft} onChange={save} /><div className="answer-footer"><span>作答草稿自动保存</span><span>{q.kind === 'short' ? '简答按参考要点自评' : '客观题按参考答案核对'}</span></div><div className="button-row"><button className="button" disabled={checking} onClick={()=>void check()}>{checking?'正在核对…':q.kind === 'short' ? '对照参考，完成自评' : '核对答案并自评'}</button><button className="button secondary" onClick={help}>答题评价是怎样实现的？</button></div></section>
      {reference && reference.response===draft && <section className="panel reference-panel"><span className="eyebrow">参考核对与掌握自评分开记录</span><ReferenceContent question={reference.question} draft={draft} assessment={reference.assessment} />{q.kind === 'short' && <><h3>对照评分要点</h3><p className="small-copy muted">请你勾选已经覆盖的要点，系统没有自动识别这些内容。</p>{reference.question.points.map((p, i) => <label className="check-line" key={i}><input type="checkbox" checked={checked.includes(i)} onChange={e => setChecked(e.target.checked ? [...checked, i] : checked.filter(x => x !== i))} /><span>{p}</span></label>)}</>}<h3>这次回忆情况，由你确认</h3><div className="rating-row">{['weak', 'fuzzy', 'good'].map(s => <button key={s} className={`rating ${s} ${rated === s ? 'chosen' : ''}`} onClick={() => rate(s)}>{levels[s].label}<small>{levels[s].detail}</small></button>)}</div>{rated && <div className="success-note">已保存为“{levels[rated].label}”。<button className="button secondary small" onClick={() => go('/practice')}>返回列表看状态</button></div>}</section>}
      {record?.previousDrafts?.length>0&&<section className="panel"><h3>旧版未提交草稿</h3>{[...record.previousDrafts].reverse().map((old,i)=><details key={i}><summary>v{old.version} · {date(old.at)}</summary><p>{old.snapshot?.prompt}</p><p className="preserve">{old.answer}</p></details>)}</section>}{record?.attempts?.length > 0 && <section className="panel"><h3>这道题的练习记录</h3>{[...record.attempts].reverse().slice(0, 5).map((a, i) => <details key={a.at + '-' + i}><summary>{date(a.at)} · {levels[a.status].label} · {a.questionSnapshot ? 'v' + a.questionSnapshot.version : '早期记录'}</summary>{a.questionSnapshot && <p className="small-copy muted">当时题干：{a.questionSnapshot.prompt}</p>}<p className="preserve">{a.answerText || a.answer}</p></details>)}</section>}
    </div><div className="stack"><section className="panel"><span className="eyebrow">当前题组</span><h3>{q.group.title}</h3><button className={'related ' + (!q.isVariant ? 'current' : '')} onClick={() => openQuestion(q.group.id)}>原题：{q.group.title}<span>{!q.isVariant ? '当前题目' : '返回原题'}</span></button><h3>关联变式 · {q.group.variants.length} 题</h3>{q.group.variants.length ? q.group.variants.map(v => <button key={v.id} className={'related ' + (v.id === q.id ? 'current' : '')} onClick={() => openQuestion(v.id)}>{v.title}<span>{v.id === q.id ? '当前变式' : levels[masteryStatus(practice[v.id], v)].label + ' · 点击练习'}</span></button>) : <p className="muted">当前没有已发布的关联变式。</p>}</section><section className="panel soft"><h3>关联知识</h3><p>{q.topic?.title}</p><button className="button secondary" onClick={() => go('/knowledge/' + q.topic.id)}>查看知识讲解</button></section><section className="panel"><h3>来源与内容版本</h3><p className="small-copy">{q.sourceType} · 内容版本 v{q.version || 1}。题目更新后需重新自评，历史作答保留当时版本。</p>{q.sourceUrl && <a className="text-link" href={q.sourceUrl} target="_blank" rel="noreferrer">打开来源资料</a>}</section></div></div>
  </>;
}
