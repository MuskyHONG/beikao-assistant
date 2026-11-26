import guide from './caseGuide.json';

export function CaseGuide({ from }: { from: string | null }) {
  const question = from?.match(/^\/practice\/question\/[^/?#]+(?:\/review\/[^/?#]+)?(?:\?from=(?:home|wrong))?$/);
  return <>
    <header className="page-heading"><div><h1>陌生案例入门</h1><p>读题 → 搭框架 → 写具体行动</p></div></header>
    <section className="panel"><h2>先读题，再动笔</h2><ol>
      <li>圈出题目动词、对象与矛盾。</li>
      <li>列出对应题目要求的 4 至 6 个小标题。</li>
      <li>每条写动作、责任人、流程或资源。</li>
    </ol></section>
    <section className="panel"><h2>扁平化改革案例</h2><p>{guide.prompt}</p>
      <p className="small-copy muted">同事体验版教学示例，基于考生回忆，未获官方核验。</p>
      <details><summary>展开完整七步示范</summary><ol className="case-steps">{guide.steps.map(([title, instruction, example]) =>
        <li key={title}><strong>{title}</strong><p>{instruction} {example}</p></li>)}</ol></details>
    </section>
    <div className="button-row"><a className="button secondary" href={question ? '#' + question[0] : '#/home'}>{question ? '返回作答' : '返回首页'}</a>
      <a className="button" href="#/knowledge/A05">查看相关知识卡</a></div>
  </>;
}
