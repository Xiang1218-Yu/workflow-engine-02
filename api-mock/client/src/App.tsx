import { useEffect, useMemo, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { deleteMock, listMocks, replayMock, saveMock } from './api';
import type { HttpMethod, MockRoute, MockRouteInput, ReplayResult } from './types';

const methods: HttpMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD'];
const blankForm: MockRouteInput = {
  name: '', method: 'GET', path: '/', statusCode: 200,
  responseHeaders: { 'content-type': 'application/json' }, responseBody: '{\n  "ok": true\n}', description: ''
};

export default function App() {
  const [routes, setRoutes] = useState<MockRoute[]>([]);
  const [selectedId, setSelectedId] = useState<string>();
  const [form, setForm] = useState<MockRouteInput>(blankForm);
  const [testMethod, setTestMethod] = useState<HttpMethod>('GET');
  const [testPath, setTestPath] = useState('/health');
  const [testBody, setTestBody] = useState('');
  const [result, setResult] = useState<ReplayResult>();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const selected = useMemo(() => routes.find((route) => route.id === selectedId), [routes, selectedId]);

  useEffect(() => { void refresh(); }, []);

  async function refresh() {
    try { setRoutes(await listMocks()); } catch (error) { setNotice(errorMessage(error)); }
  }

  function selectRoute(route?: MockRoute) {
    setSelectedId(route?.id);
    setForm(route ? toInput(route) : { ...blankForm, responseHeaders: { ...blankForm.responseHeaders } });
    setTestMethod(route?.method || 'GET');
    setTestPath(route?.path || '/health');
    setResult(undefined);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setNotice('');
    try {
      const saved = await saveMock({ ...form, statusCode: Number(form.statusCode) }, selectedId);
      await refresh(); selectRoute(saved); setNotice(selectedId ? 'Mock 路由已更新' : 'Mock 路由已创建');
    } catch (error) { setNotice(errorMessage(error)); }
    finally { setBusy(false); }
  }

  async function remove() {
    if (!selected || !window.confirm(`确定删除“${selected.name}”吗？`)) return;
    setBusy(true);
    try { await deleteMock(selected.id); await refresh(); selectRoute(); setNotice('Mock 路由已删除'); }
    catch (error) { setNotice(errorMessage(error)); }
    finally { setBusy(false); }
  }

  async function replay() {
    setBusy(true); setNotice('');
    try { setResult(await replayMock({ method: testMethod, path: testPath, body: testBody })); }
    catch (error) { setNotice(errorMessage(error)); }
    finally { setBusy(false); }
  }

  return <div className="shell">
    <header className="topbar">
      <div><div className="eyebrow">API TOOLKIT / MEMORY MODE</div><h1>API Mock Studio</h1><p>录制请求、配置响应，然后用同一套路由快速回放。</p></div>
      <div className="top-actions"><span className="status-dot" /> <span>服务端 :4000</span><button className="secondary" onClick={() => selectRoute()}>＋ 新建路由</button></div>
    </header>
    {notice && <div className="notice">{notice}</div>}
    <main className="layout">
      <aside className="panel route-panel">
        <div className="panel-heading"><div><span className="kicker">ROUTES</span><h2>Mock 路由</h2></div><span className="count">{routes.length}</span></div>
        <div className="route-list">
          {routes.map((route) => <button key={route.id} className={`route-item ${route.id === selectedId ? 'active' : ''}`} onClick={() => selectRoute(route)}>
            <span className={`method method-${route.method.toLowerCase()}`}>{route.method}</span><span className="route-copy"><strong>{route.name}</strong><small>{route.path}</small></span><span className="arrow">›</span>
          </button>)}
          {!routes.length && <div className="empty">还没有路由，创建第一条吧。</div>}
        </div>
      </aside>
      <section className="content">
        <div className="panel editor-panel">
          <div className="panel-heading"><div><span className="kicker">CONFIGURATION</span><h2>{selected ? '编辑 Mock 路由' : '创建 Mock 路由'}</h2></div>{selected && <button className="danger ghost" onClick={remove} disabled={busy}>删除</button>}</div>
          <form onSubmit={submit}>
            <div className="form-grid two"><Field label="路由名称"><input value={form.name} onChange={(e) => update('name', e.target.value)} placeholder="例如：订单详情" required /></Field><Field label="HTTP 方法"><select value={form.method} onChange={(e) => update('method', e.target.value as HttpMethod)}>{methods.map((method) => <option key={method}>{method}</option>)}</select></Field></div>
            <Field label="匹配路径" hint="支持 /users/:id 和 /assets/*"><input value={form.path} onChange={(e) => update('path', e.target.value)} placeholder="/users/:id" required /></Field>
            <div className="form-grid two"><Field label="状态码"><input type="number" min="100" max="599" value={form.statusCode} onChange={(e) => update('statusCode', Number(e.target.value))} /></Field><Field label="描述"><input value={form.description} onChange={(e) => update('description', e.target.value)} placeholder="可选说明" /></Field></div>
            <Field label="响应头" hint="每行一个 Header: value"><textarea className="compact" value={headersToText(form.responseHeaders)} onChange={(e) => update('responseHeaders', textToHeaders(e.target.value))} /></Field>
            <Field label="响应体"><textarea className="response-body" value={form.responseBody} onChange={(e) => update('responseBody', e.target.value)} spellCheck={false} /></Field>
            <div className="form-actions"><span className="subtle">修改即时保存在内存中，重启服务后恢复示例数据。</span><button className="primary" disabled={busy}>{selected ? '保存修改' : '创建路由'}</button></div>
          </form>
        </div>
        <div className="panel replay-panel">
          <div className="panel-heading"><div><span className="kicker">REPLAY</span><h2>回放请求测试</h2></div><span className="hint-pill">POST /api/replay</span></div>
          <div className="replay-controls"><select value={testMethod} onChange={(e) => setTestMethod(e.target.value as HttpMethod)}>{methods.map((method) => <option key={method}>{method}</option>)}</select><input value={testPath} onChange={(e) => setTestPath(e.target.value)} placeholder="/health" /><button className="primary" onClick={replay} disabled={busy}>发送回放</button></div>
          <Field label="请求体"><textarea className="compact" value={testBody} onChange={(e) => setTestBody(e.target.value)} placeholder="可选，例如 {\"id\": 1}" /></Field>
          {result && <div className={`result ${result.matched ? 'success' : 'failure'}`}><div className="result-head"><strong>{result.matched ? '✓ 已匹配' : '× 未匹配'}</strong><span>HTTP {result.response.statusCode}</span></div>{result.route && <div className="matched-route">命中：{result.route.method} {result.route.path} · {result.route.name}</div>}<pre>{result.response.body || '(空响应体)'}</pre></div>}
        </div>
      </section>
    </main>
    <footer>基础平台 · 可继续拆分为持久化、代理录制、Schema 匹配和延迟注入等 GSB 题目</footer>
  </div>;

  function update<K extends keyof MockRouteInput>(key: K, value: MockRouteInput[K]) { setForm((current) => ({ ...current, [key]: value })); }
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) { return <label className="field"><span className="field-label">{label}{hint && <small>{hint}</small>}</span>{children}</label>; }
function toInput(route: MockRoute): MockRouteInput { const { id: _id, createdAt: _createdAt, updatedAt: _updatedAt, ...input } = route; return input; }
function headersToText(headers: Record<string, string>) { return Object.entries(headers).map(([key, value]) => `${key}: ${value}`).join('\n'); }
function textToHeaders(text: string) { return Object.fromEntries(text.split('\n').map((line) => line.trim()).filter(Boolean).map((line) => { const index = line.indexOf(':'); return index === -1 ? [line, ''] : [line.slice(0, index).trim(), line.slice(index + 1).trim()]; })); }
function errorMessage(error: unknown) { return error instanceof Error ? error.message : '操作失败'; }
