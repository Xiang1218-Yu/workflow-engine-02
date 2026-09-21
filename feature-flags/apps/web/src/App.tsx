import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { api } from './api';
import type { Evaluation, Flag, FlagDraft, Primitive, Rule } from './types';

const emptyDraft: FlagDraft = {
  key: '',
  name: '',
  description: '',
  defaultValue: false,
  rules: [],
};

function ruleSummary(rule: Rule): string {
  if (rule.type === 'attribute_equals') return `${rule.attribute} equals ${String(rule.value)} → ${rule.serve ? 'on' : 'off'}`;
  return `${rule.percentage}% → ${rule.serve ? 'on' : 'off'}`;
}

export default function App() {
  const [flags, setFlags] = useState<Flag[]>([]);
  const [selectedKey, setSelectedKey] = useState('');
  const [draft, setDraft] = useState<FlagDraft>(emptyDraft);
  const [userId, setUserId] = useState('user-42');
  const [attributesText, setAttributesText] = useState('{\n  "plan": "pro",\n  "country": "US"\n}');
  const [evaluation, setEvaluation] = useState<Evaluation | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const selectedFlag = useMemo(() => flags.find((flag) => flag.key === selectedKey) ?? null, [flags, selectedKey]);

  async function refresh(preferredKey?: string) {
    const nextFlags = await api.listFlags();
    setFlags(nextFlags);
    const nextKey = preferredKey ?? selectedKey;
    if (nextFlags.some((flag) => flag.key === nextKey)) setSelectedKey(nextKey);
    else setSelectedKey(nextFlags[0]?.key ?? '');
  }

  useEffect(() => {
    refresh().catch((error: Error) => setMessage(error.message));
  }, []);

  useEffect(() => {
    if (selectedFlag) {
      setDraft({
        key: selectedFlag.key,
        name: selectedFlag.name,
        description: selectedFlag.description,
        defaultValue: selectedFlag.defaultValue,
        rules: selectedFlag.rules.map((rule) => rule.type === 'attribute_equals'
          ? { type: rule.type, attribute: rule.attribute, value: rule.value, serve: rule.serve }
          : { type: rule.type, percentage: rule.percentage, serve: rule.serve }),
      });
    }
  }, [selectedFlag]);

  function updateDraft<K extends keyof FlagDraft>(key: K, value: FlagDraft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function addRule(type: Rule['type']) {
    const nextRule = type === 'attribute_equals'
      ? { type, attribute: 'plan', value: 'pro' as Primitive, serve: true }
      : { type, percentage: 25, serve: true };
    updateDraft('rules', [...draft.rules, nextRule]);
  }

  function updateRule(index: number, patch: Partial<FlagDraft['rules'][number]>) {
    updateDraft('rules', draft.rules.map((rule, ruleIndex) => ruleIndex === index ? { ...rule, ...patch } : rule));
  }

  async function saveFlag(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage('');
    try {
      const saved = await api.createFlag(draft);
      await refresh(saved.key);
      setMessage(`已创建 ${saved.key}`);
      setDraft(emptyDraft);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '保存失败');
    } finally {
      setBusy(false);
    }
  }

  async function evaluate() {
    if (!selectedFlag) return;
    setBusy(true);
    setMessage('');
    try {
      const attributes = JSON.parse(attributesText) as Record<string, string>;
      const result = await api.evaluate(selectedFlag.key, { userId, attributes });
      setEvaluation(result);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '评估失败');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="shell">
      <header className="hero">
        <div>
          <span className="eyebrow">CONTROL PLANE / v0.1</span>
          <h1>Feature Flag <em>&amp;</em> 灰度发布</h1>
          <p>用清晰的默认值、用户属性规则和确定性百分比，把发布风险切成可验证的小步。</p>
        </div>
        <div className="hero-mark"><span>FF</span><small>rollout<br />studio</small></div>
      </header>

      {message && <div className="notice">{message}</div>}

      <section className="workspace">
        <aside className="panel flag-list-panel">
          <div className="panel-heading"><div><span className="section-kicker">01 / FLAGS</span><h2>功能开关</h2></div><span className="count">{flags.length}</span></div>
          <div className="flag-list">
            {flags.map((flag) => (
              <button key={flag.key} className={`flag-row ${selectedKey === flag.key ? 'active' : ''}`} onClick={() => setSelectedKey(flag.key)}>
                <span className={`status-dot ${flag.defaultValue ? 'on' : ''}`} />
                <span className="flag-row-copy"><strong>{flag.name}</strong><small>{flag.key}</small></span>
                <span className="chevron">→</span>
              </button>
            ))}
            {flags.length === 0 && <div className="empty">还没有开关，先创建一个。</div>}
          </div>
          <div className="list-footnote"><span className="pulse" />内存存储 · API 在线</div>
        </aside>

        <section className="panel detail-panel">
          <div className="panel-heading"><div><span className="section-kicker">02 / INSPECT</span><h2>开关详情</h2></div>{selectedFlag && <span className="tag">{selectedFlag.defaultValue ? 'DEFAULT ON' : 'DEFAULT OFF'}</span>}</div>
          {selectedFlag ? <>
            <div className="flag-title"><div><h3>{selectedFlag.name}</h3><code>{selectedFlag.key}</code></div><span className="large-toggle"><span className={selectedFlag.defaultValue ? 'checked' : ''} /></span></div>
            <p className="description">{selectedFlag.description || '这个开关还没有描述。'}</p>
            <div className="rule-heading"><h3>评估规则</h3><span>按顺序匹配</span></div>
            <div className="rule-list">
              {selectedFlag.rules.map((rule, index) => <div className="rule-card" key={rule.id}><span className="rule-index">0{index + 1}</span><div><strong>{rule.type === 'attribute_equals' ? '用户属性 equals' : '百分比灰度'}</strong><p>{ruleSummary(rule)}</p></div></div>)}
              {selectedFlag.rules.length === 0 && <div className="empty rule-empty">无规则，将返回默认值。</div>}
            </div>
            <div className="json-hint">API 评估：<code>POST /api/flags/{selectedFlag.key}/evaluate</code></div>
          </> : <div className="empty detail-empty">从左侧选择一个开关。</div>}
        </section>

        <section className="panel evaluate-panel">
          <div className="panel-heading"><div><span className="section-kicker">03 / SIMULATE</span><h2>测试评估</h2></div><span className="lab-mark">LAB</span></div>
          <label>用户 ID<input value={userId} onChange={(event) => setUserId(event.target.value)} placeholder="user-42" /></label>
          <label>用户属性 <span className="label-note">JSON</span><textarea value={attributesText} onChange={(event) => setAttributesText(event.target.value)} rows={7} /></label>
          <button className="primary-button" disabled={busy || !selectedFlag} onClick={evaluate}>{busy ? '处理中…' : '运行评估 →'}</button>
          {evaluation && <div className={`evaluation-result ${evaluation.value ? 'enabled' : 'disabled'}`}><div className="result-label">RESULT</div><strong>{evaluation.value ? 'ON' : 'OFF'}</strong><p>{evaluation.reason === 'default' ? '返回默认值' : `命中 ${evaluation.reason === 'percentage' ? '百分比灰度' : '用户属性'} 规则`}</p>{evaluation.bucket !== null && <small>bucket {evaluation.bucket}%</small>}</div>}
        </section>
      </section>

      <section className="panel create-panel">
        <div className="create-copy"><span className="section-kicker">04 / COMPOSE</span><h2>创建新的开关</h2><p>先定义安全的默认值，再把逐步放量策略写成显式规则。</p></div>
        <form onSubmit={saveFlag} className="create-form">
          <div className="form-grid"><label>Key<input required pattern="[a-zA-Z0-9][a-zA-Z0-9._-]{1,63}" value={draft.key} onChange={(event) => updateDraft('key', event.target.value)} placeholder="search-v2" /></label><label>名称<input required value={draft.name} onChange={(event) => updateDraft('name', event.target.value)} placeholder="新版搜索" /></label></div>
          <label>描述<input value={draft.description} onChange={(event) => updateDraft('description', event.target.value)} placeholder="这条开关控制什么？" /></label>
          <label className="switch-line"><input type="checkbox" checked={draft.defaultValue} onChange={(event) => updateDraft('defaultValue', event.target.checked)} /><span className="fake-switch" />默认值为 ON</label>
          <div className="rule-builder"><div className="builder-heading"><strong>规则</strong><div><button type="button" className="secondary-button" onClick={() => addRule('attribute_equals')}>+ 属性 equals</button><button type="button" className="secondary-button" onClick={() => addRule('percentage')}>+ 百分比</button></div></div>
            {draft.rules.map((rule, index) => <div className="builder-row" key={index}><span>0{index + 1}</span>{rule.type === 'attribute_equals' ? <><input value={rule.attribute ?? ''} onChange={(event) => updateRule(index, { attribute: event.target.value })} placeholder="attribute" /><span>equals</span><input value={String(rule.value ?? '')} onChange={(event) => updateRule(index, { value: event.target.value })} placeholder="value" /></> : <><span>放量</span><input type="number" min="0" max="100" value={rule.percentage ?? 0} onChange={(event) => updateRule(index, { percentage: Number(event.target.value) })} /><span>%</span></>}<select value={rule.serve ? 'on' : 'off'} onChange={(event) => updateRule(index, { serve: event.target.value === 'on' })}><option value="on">ON</option><option value="off">OFF</option></select></div>)}
            {draft.rules.length === 0 && <div className="builder-empty">还没有规则。未命中时会使用默认值。</div>}
          </div>
          <button className="primary-button create-button" disabled={busy}>{busy ? '创建中…' : '创建开关 +'}</button>
        </form>
      </section>

      <footer><span>FEATURE FLAGS / GRAY RELEASE SERVICE</span><span>built for safe iteration</span></footer>
    </main>
  );
}
