import React from 'react';
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
