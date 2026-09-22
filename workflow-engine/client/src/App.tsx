import { useEffect, useMemo, useState } from "react";
import type { BranchCondition, ConditionOperator, CreateWorkflowInput, StepType, Workflow, WorkflowRun, WorkflowStep } from "../../shared/types";
import { validateWorkflowSteps } from "../../shared/validation";
import { api } from "./api";

const emptySteps: WorkflowStep[] = [{ id: crypto.randomUUID(), type: "log", message: "Hello from my workflow" }];

/** Path into the step tree: even entries are list indexes, odd entries are "then"/"else". */
type ListPath = Array<number | "then" | "else">;

const OPERATOR_OPTIONS: Array<{ value: ConditionOperator; label: string }> = [
  { value: "eq", label: "equals (string =)" },
  { value: "ne", label: "does not equal (string ≠)" },
  { value: "gt", label: "is greater than (>)" },
  { value: "gte", label: "is at least (≥)" },
  { value: "lt", label: "is less than (<)" },
  { value: "lte", label: "is at most (≤)" },
  { value: "notExists", label: "variable is not set" }
];

function newStep(type: StepType): WorkflowStep {
  const id = crypto.randomUUID();
  if (type === "log") return { id, type, message: "Write something to the run log" };
  if (type === "set") return { id, type, key: "key", value: "value" };
  if (type === "delay") return { id, type, durationMs: 500 };
  return {
    id,
    type: "branch",
    condition: { left: "{{name}}", operator: "eq", right: "admin" },
    then: [{ id: crypto.randomUUID(), type: "log", message: "Condition matched" }]
  };
}

function changeList(steps: WorkflowStep[], path: ListPath, produce: (list: WorkflowStep[]) => WorkflowStep[]): WorkflowStep[] {
  if (path.length === 0) return produce(steps);
  const [index, side, ...rest] = path;
  return steps.map((step, stepIndex) => {
    if (stepIndex !== index || step.type !== "branch") return step;
    const sideKey = side as "then" | "else";
    const current = step[sideKey];
    if (!current) return step;
    const updated = changeList(current, rest, produce);
    return sideKey === "then" ? { ...step, then: updated } : { ...step, else: updated };
  });
}

function patchStep(step: WorkflowStep, patch: Partial<WorkflowStep>): WorkflowStep {
  return { ...step, ...patch } as WorkflowStep;
}

function childPath(path: ListPath, index: number, side: "then" | "else"): ListPath {
  return [...path, index, side];
}

export function App() {
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [selectedId, setSelectedId] = useState<string>();
  const [name, setName] = useState("Untitled workflow");
  const [description, setDescription] = useState("");
  const [steps, setSteps] = useState<WorkflowStep[]>(emptySteps);
  const [run, setRun] = useState<WorkflowRun>();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const selected = useMemo(() => workflows.find((workflow) => workflow.id === selectedId), [selectedId, workflows]);

  useEffect(() => {
    api.listWorkflows().then(({ workflows: loaded }) => {
      setWorkflows(loaded);
      if (loaded[0]) selectWorkflow(loaded[0]);
    }).catch((err: Error) => setError(err.message)).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!run || (run.status !== "queued" && run.status !== "running")) return;
    const timer = window.setInterval(() => {
      api.getRun(run.id).then(({ run: latest }) => setRun(latest)).catch((err: Error) => setError(err.message));
    }, 350);
    return () => window.clearInterval(timer);
  }, [run]);

  function selectWorkflow(workflow: Workflow) {
    setSelectedId(workflow.id);
    setName(workflow.name);
    setDescription(workflow.description);
    setSteps(workflow.steps);
    setRun(undefined);
    setError("");
  }

  function startNewWorkflow() {
    setSelectedId(undefined);
    setName("Untitled workflow");
    setDescription("");
    setSteps([newStep("log")]);
    setRun(undefined);
    setError("");
  }

  const treeActions = {
    add(path: ListPath, step: WorkflowStep) {
      setSteps((current) => changeList(current, path, (list) => [...list, step]));
    },
    remove(path: ListPath, index: number) {
      setSteps((current) => changeList(current, path, (list) => list.filter((_, stepIndex) => stepIndex !== index)));
    },
    replace(path: ListPath, index: number, next: WorkflowStep) {
      setSteps((current) => changeList(current, path, (list) => list.map((step, stepIndex) => (stepIndex === index ? next : step))));
    }
  };

  async function saveWorkflow() {
    setSaving(true);
    setError("");
    const result = validateWorkflowSteps(steps);
    if (!name.trim()) result.errors.push("Workflow name cannot be empty.");
    if (!result.valid) {
      setError(`Please fix the following before saving:\n${result.errors.join("\n")}`);
      setSaving(false);
      return;
    }
    try {
      const input: CreateWorkflowInput = { name, description, steps };
      const { workflow } = await api.createWorkflow(input);
      setWorkflows((current) => [workflow, ...current]);
      selectWorkflow(workflow);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save workflow");
    } finally {
      setSaving(false);
    }
  }

  async function runWorkflow() {
    if (!selectedId) {
      setError("Save the workflow before running it.");
      return;
    }
    setError("");
    try {
      const { run: createdRun } = await api.runWorkflow(selectedId);
      setRun(createdRun);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start workflow");
    }
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand"><span className="brand-mark">◎</span><div><strong>FlowFoundry</strong><small>CONFIGURABLE AUTOMATION</small></div></div>
        <div className="topbar-actions"><span className="api-status"><i /> API connected</span><button className="button ghost" onClick={startNewWorkflow}>＋ New workflow</button></div>
      </header>

      <div className="workspace">
        <aside className="sidebar">
          <div className="sidebar-heading"><span>WORKFLOWS</span><button className="icon-button" onClick={startNewWorkflow} aria-label="Create workflow">＋</button></div>
          {loading && <p className="muted">Loading workflows…</p>}
          {!loading && workflows.length === 0 && <p className="muted">No workflows yet.</p>}
          <div className="workflow-list">
            {workflows.map((workflow) => <button key={workflow.id} className={`workflow-item ${selectedId === workflow.id ? "active" : ""}`} onClick={() => selectWorkflow(workflow)}><span className="workflow-dot" /><span><strong>{workflow.name}</strong><small>{workflow.steps.length} steps</small></span></button>)}
          </div>
          <div className="sidebar-footer"><span className="shortcut">⌘ K</span> Keyboard shortcuts</div>
        </aside>

        <section className="content">
          <div className="page-heading"><div><p className="eyebrow">WORKFLOW BUILDER</p><h1>{selected ? selected.name : "New workflow"}</h1><p className="subheading">Compose deterministic steps and conditional branches, then run and inspect them in real time.</p></div><div className="heading-actions"><button className="button secondary" onClick={saveWorkflow} disabled={saving}>{saving ? "Saving…" : "Save workflow"}</button><button className="button primary" onClick={runWorkflow}>▶ Run workflow</button></div></div>
          {error && <div className="alert alert-lines">{error}</div>}

          <div className="builder-grid">
            <div className="builder-card">
              <div className="card-title"><div><span className="step-number">01</span><h2>Details</h2></div><span className="card-hint">IDENTITY</span></div>
              <label>Workflow name<input value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Daily digest" /></label>
              <label>Description <span className="optional">optional</span><textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="What does this workflow automate?" rows={3} /></label>
            </div>

            <div className="builder-card steps-card">
              <div className="card-title"><div><span className="step-number">02</span><h2>Steps</h2></div><span className="card-hint">RUN IN ORDER</span></div>
              <StepList steps={steps} path={[]} actions={treeActions} />
              <div className="add-step-row"><span className="connector" /><button className="add-step" onClick={() => treeActions.add([], newStep("log"))}>＋ Add step</button><span className="step-count">{steps.length} {steps.length === 1 ? "step" : "steps"}</span></div>
            </div>
          </div>

          <section className="run-card"><div className="run-header"><div><p className="eyebrow">OBSERVABILITY</p><h2>Latest run</h2></div>{run ? <span className={`status ${run.status}`}><i /> {run.status}</span> : <span className="status idle"><i /> not started</span>}</div>{run ? <div className="run-content"><div className="run-meta"><span>RUN ID <strong>{run.id.slice(0, 8)}…</strong></span><span>STARTED <strong>{new Date(run.startedAt).toLocaleTimeString()}</strong></span><span>VARIABLES <strong>{Object.keys(run.variables).length}</strong></span></div><div className="log-console">{run.logs.map((log, index) => <div className={`log-line ${log.level}`} key={`${log.at}-${index}`}><time>{new Date(log.at).toLocaleTimeString()}</time><span className="log-bullet">{log.level === "error" ? "!" : "›"}</span><span>{log.message}</span></div>)}{run.logs.length === 0 && <span className="muted">Wait for execution…</span>}</div></div> : <div className="empty-run"><span className="pulse">◌</span><p>Run this workflow to see live execution logs and variables.</p></div>}</section>
        </section>
      </div>
    </main>
  );
}

interface TreeActions {
  add: (path: ListPath, step: WorkflowStep) => void;
  remove: (path: ListPath, index: number) => void;
  replace: (path: ListPath, index: number, next: WorkflowStep) => void;
}

interface StepListProps {
  steps: WorkflowStep[];
  path: ListPath;
  actions: TreeActions;
}

function StepList({ steps, path, actions }: StepListProps) {
  return (
    <div className="steps-list">
      {steps.map((step, index) => (
        <StepRow key={step.id} step={step} index={index} path={path} actions={actions} />
      ))}
    </div>
  );
}

interface StepRowProps {
  step: WorkflowStep;
  index: number;
  path: ListPath;
  actions: TreeActions;
}

function StepRow({ step, index, path, actions }: StepRowProps) {
  function update(patch: Partial<WorkflowStep>) {
    actions.replace(path, index, patchStep(step, patch));
  }

  return (
    <div className="step-row">
      <div className="drag-handle">⠿</div>
      <div className="step-index">{String(index + 1).padStart(2, "0")}</div>
      <div className="step-editor">
        <div className="step-header">
          <select value={step.type} onChange={(event) => actions.replace(path, index, newStep(event.target.value as StepType))}>
            <option value="log">log · Write to run log</option>
            <option value="set">set · Save a variable</option>
            <option value="delay">delay · Pause execution</option>
            <option value="branch">branch · Conditional path</option>
          </select>
          <button className="remove" onClick={() => actions.remove(path, index)} aria-label={`Remove step ${index + 1}`}>×</button>
        </div>

        {step.type === "log" && (
          <input value={step.message} onChange={(event) => update({ message: event.target.value })} placeholder="Message (supports {{variable}})" />
        )}

        {step.type === "set" && (
          <div className="inline-fields">
            <input value={step.key} onChange={(event) => update({ key: event.target.value })} placeholder="Variable name" />
            <input value={step.value} onChange={(event) => update({ value: event.target.value })} placeholder="Value (supports {{variable}})" />
          </div>
        )}

        {step.type === "delay" && (
          <label className="compact-label">Duration in milliseconds
            <input type="number" min={0} max={60000} value={step.durationMs} onChange={(event) => update({ durationMs: Number(event.target.value) })} />
          </label>
        )}

        {step.type === "branch" && (
          <BranchEditor step={step} index={index} path={path} actions={actions} />
        )}
      </div>
    </div>
  );
}

interface BranchEditorProps {
  step: Extract<WorkflowStep, { type: "branch" }>;
  index: number;
  path: ListPath;
  actions: TreeActions;
}

function BranchEditor({ step, index, path, actions }: BranchEditorProps) {
  const condition = step.condition;
  const isNotExists = condition.operator === "notExists";
  const thenPath = childPath(path, index, "then");
  const elsePath = childPath(path, index, "else");

  function updateCondition(patch: Partial<BranchCondition>) {
    actions.replace(path, index, patchStep(step, { condition: { ...condition, ...patch } }));
  }

  function changeOperator(operator: ConditionOperator) {
    updateCondition({ operator, right: operator === "notExists" ? undefined : (condition.right ?? "") });
  }

  return (
    <div className="branch-editor">
      <div className="condition-row">
        <span className="condition-label">IF</span>
        <input
          value={condition.left}
          onChange={(event) => updateCondition({ left: event.target.value })}
          placeholder={isNotExists ? "{{variable}}" : "Value or {{variable}}"}
          aria-label="Condition left operand"
        />
        <select value={condition.operator} onChange={(event) => changeOperator(event.target.value as ConditionOperator)} aria-label="Condition operator">
          {OPERATOR_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
        {!isNotExists && (
          <input
            value={condition.right ?? ""}
            onChange={(event) => updateCondition({ right: event.target.value })}
            placeholder="Value or {{variable}}"
            aria-label="Condition right operand"
          />
        )}
      </div>

      <div className="branch-path then-path">
        <div className="branch-path-heading"><span className="branch-tag then">THEN</span><span className="branch-hint">runs when the condition is true</span></div>
        <StepList steps={step.then} path={thenPath} actions={actions} />
        <button className="add-step branch-add" onClick={() => actions.add(thenPath, newStep("log"))}>＋ Add step to then</button>
      </div>

      {step.else ? (
        <div className="branch-path else-path">
          <div className="branch-path-heading">
            <span className="branch-tag else">ELSE</span><span className="branch-hint">runs when the condition is false</span>
            <button className="remove-branch-path" onClick={() => actions.replace(path, index, patchStep(step, { else: undefined }))}>Remove else path</button>
          </div>
          <StepList steps={step.else} path={elsePath} actions={actions} />
          <button className="add-step branch-add" onClick={() => actions.add(elsePath, newStep("log"))}>＋ Add step to else</button>
        </div>
      ) : (
        <button className="add-step branch-add" onClick={() => actions.replace(path, index, patchStep(step, { else: [newStep("log")] }))}>＋ Add else path (optional)</button>
      )}
    </div>
  );
}
