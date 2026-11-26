import { useRef, useState } from 'react';
import { localDateKey } from './studyPlan.js';

const prettyDate = (value: string) => value.replaceAll('-', ' / ');
const startOfMonth = (key: string) => new Date(key.slice(0, 7) + '-01T12:00:00');

export function ExamDatePicker({ value, today, onChange }: {
  value: string; today: string; onChange: (value: string) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [month, setMonth] = useState(() => startOfMonth(today));
  const year = month.getFullYear(), index = month.getMonth();
  const offset = (month.getDay() + 6) % 7;
  const count = new Date(year, index + 1, 0, 12).getDate();
  const minMonth = today.slice(0, 7);
  const monthKey = localDateKey(month).slice(0, 7);

  function openCalendar() {
    setMonth(startOfMonth(value >= today ? value : today));
    dialog.current?.showModal();
    requestAnimationFrame(() => {
      const current = dialog.current;
      if (current?.open) {
        (current.querySelector<HTMLButtonElement>('.calendar-days [aria-pressed="true"]:enabled') ??
          current.querySelector<HTMLButtonElement>('.calendar-days button:enabled'))?.focus();
      }
    });
  }
  function changeMonth(step: number) {
    setMonth(new Date(year, index + step, 1, 12));
  }

  return <div className="goal-date-field">
    <label id="exam-date-label" htmlFor="exam-date-picker">考试日期</label>
    <button id="exam-date-picker" className="exam-date-picker" type="button" aria-haspopup="dialog"
      aria-controls="exam-calendar" aria-labelledby="exam-date-label exam-date-value" onClick={openCalendar}>
      <span id="exam-date-value">{value ? prettyDate(value) : '选择考试日期'}</span>
      <span className="calendar-icon" aria-hidden="true" />
    </button>
    <dialog ref={dialog} id="exam-calendar" aria-labelledby="calendar-title"
      onClick={event => { if (event.target === event.currentTarget) event.currentTarget.close(); }}>
      <header className="calendar-cover">
        <h2 id="calendar-title">选择考试日期</h2>
        <button type="button" onClick={() => dialog.current?.close()} aria-label="关闭日历">×</button>
      </header>
      <div className="calendar-navigation">
        <button type="button" onClick={() => changeMonth(-1)} disabled={monthKey <= minMonth} aria-label="上个月">‹</button>
        <strong aria-live="polite">{year} 年 {index + 1} 月</strong>
        <button type="button" onClick={() => changeMonth(1)} disabled={year === 9999 && index === 11} aria-label="下个月">›</button>
      </div>
      <div className="calendar-weekdays" aria-hidden="true">{Array.from('一二三四五六日', day => <span key={day}>{day}</span>)}</div>
      <div className="calendar-days">{Array.from({ length: 42 }, (_, cell) => {
        const day = cell - offset + 1;
        if (day < 1 || day > count) return <span key={cell} aria-hidden="true" />;
        const date = localDateKey(new Date(year, index, day, 12));
        return <button key={cell} type="button" disabled={date < today} aria-pressed={date === value}
          aria-current={date === today ? 'date' : undefined} aria-label={`${year}年${index + 1}月${day}日${date === today ? '，今天' : ''}`}
          onClick={() => { onChange(date); dialog.current?.close(); }}>{day}</button>;
      })}</div>
      <footer className="calendar-footer"><button type="button" onClick={() => setMonth(startOfMonth(today))}>回到本月</button></footer>
    </dialog>
  </div>;
}
