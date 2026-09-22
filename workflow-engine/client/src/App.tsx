import { useEffect, useMemo, useState } from "react";
import type {
  ConditionBranch,
  ConditionOperator,
  ConditionStep,
  CreateWorkflowInput,
  LeafStep,
  StepType,
  Workflow,
  WorkflowRun,
  WorkflowStep
} from "../../shared/types";
import { validateWorkflowSteps } from "../../shared/validation";
import { api } from "./api";

const emptySteps: WorkflowStep[] = [{ id: crypto.randomUUID(), type: "log", message: "Hello from my workflow" }];

function newLeafStep(type: Exclude<StepType, "condition">): LeafStep {
  const id = crypto.randomUUID();
  if (type === "log") return { id, type, message: "Write something to the run log" };
  if (type === "set") return { id, type, key: "key", value: "value" };
  return { id, type, durationMs: 500 };
}

function newConditionStep(): ConditionStep {
  return {
    id: crypto.randomUUID(),
    type: "condition",
    branches: [
      { operator: "string-eq", variable: "", value: "", steps: [{ id: crypto.randomUUID(), type: "log", message: "Condition met" }] }
    ]
  };
}

function newStep(type: StepType): WorkflowStep {
  return type === "condition" ? newConditionStep() : newLeafStep(type);
}

const OPERATOR_GROUPS: Array<{ label: string; options: Array<{ value: ConditionOperator; label: string }> }> = [
  {
    label: "String",
    options: [
      { value: "string-eq", label: "variable equals value" },
      { value: "string-neq", label: "variable does not equal value" }
    ]
  },
  {
    label: "Number",
    options: [
      { value: "number-eq", label: "variable = number" },
      { value: "number-neq", label: "variable ≠ number" },
      { value: "number-gt", label: "variable > number" },
      { value: "number-gte", label: "variable ≥ number" },
      { value: "number-lt", label: "variable < number" },
      { value: "number-lte", label: "variable ≤ number" }
    ]
  },
  {
    label: "Variable",
    options: [{ value: "var-missing", label: "variable does not exist" }]
  }
];

const OPERATORS = OPERATOR_GROUPS.flatMap((group) => group.options);
const NEEDS_VALUE: ConditionOperator[] = OPERATORS.filter((option) => option.value !== "var-missing").map((option) => option.value);

interface StepsEditorProps<TStep extends WorkflowStep> {
  steps: TStep[];
  onChange: (steps: TStep[]) => void;
  /** nesting === 0 is the workflow root (conditions allowed); branch bodies render at 1 (leaf steps only). */
  nesting: number;
}

function StepsEditor<TStep extends WorkflowStep>({ steps, onChange, nesting }: StepsEditorProps<TStep>) {
  function replaceStep(index: number, next: WorkflowStep) {
    onChange(steps.map((step, stepIndex) => (stepIndex === index ? (next as TStep) : step)));
  }

  function patchStep(index: number, patch: Partial<LeafStep>) {
    const step = steps[index];
    if (step.type !== "condition") replaceStep(index, { ...step, ...patch } as LeafStep);
  }

  function removeStep(index: number) {
    onChange(steps.filter((_, stepIndex) => stepIndex !== index));
  }

  function addStep(type: StepType) {
    onChange([...steps, newStep(type) as TStep]);
  }

  return (
    <div className={nesting === 0 ? "steps-list" : "branch-steps"}>
      {steps.map((step, index) => (
        <div className="step-row" key={step.id}>
          <div className="drag-handle">⠿</div>
          <div className="step-index">{String(index + 1).padStart(2, "0")}</div>
          <div className="step-editor">
            <div className="step-header">
              <select
                value={step.type}
                onChange={(event) => replaceStep(index, newStep(event.target.value as StepType))}
              >
                <option value="log">log · Write to run log</option>
                <option value="set">set · Save a variable</option>
                <option value="delay">delay · Pause execution</option>
                {nesting === 0 && <option value="condition">condition · Branch on a variable</option>}
              </select>
              <button
                className="remove"
                onClick={() => removeStep(index)}
                aria-label={`Remove step ${index + 1}`}
              >
                ×
              </button>
            </div>

            {step.type === "log" && (
              <input
                value={step.message}
                onChange={(event) => patchStep(index, { message: event.target.value })}
                placeholder="Message (supports {{variable}})"
              />
            )}
            {step.type === "set" && (
              <div className="inline-fields">
                <input
                  value={step.key}
                  onChange={(event) => patchStep(index, { key: event.target.value })}
                  placeholder="Variable name"
                />
                <input
                  value={step.value}
                  onChange={(event) => patchStep(index, { value: event.target.value })}
                  placeholder="Value (supports {{variable}})"
                />
              </div>
            )}
            {step.type === "delay" && (
              <label className="compact-label">
                Duration in milliseconds
                <input
                  type="number"
                  min={0}
                  max={60000}
                  value={step.durationMs}
                  onChange={(event) => patchStep(index, { durationMs: Number(event.target.value) })}
                />
              </label>
            )}
            {step.type === "condition" && nesting === 0 && (
              <BranchesEditor
                branches={step.branches}
                onChange={(branches) => replaceStep(index, { ...step, branches })}
              />
            )}
          </div>
        </div>
      ))}

      <div className="add-step-row">
        <span className="connector" />
        {nesting === 0 ? (
          <div className="add-step-actions">
            <button className="add-step" onClick={() => addStep("log")}>＋ Add step</button>
            <button className="add-step condition" onClick={() => addStep("condition")}>＋ Add condition branch</button>
          </div>
        ) : (
          <button className="add-step" onClick={() => addStep("log")}>＋ Add log / set / delay</button>
        )}
        <span className="step-count">{steps.length} {steps.length === 1 ? "step" : "steps"}</span>
      </div>
    </div>
  );
}

interface BranchesEditorProps {
  branches: ConditionBranch[];
  onChange: (branches: ConditionBranch[]) => void;
}

function BranchesEditor({ branches, onChange }: BranchesEditorProps) {
  function updateBranch(index: number, patch: Partial<ConditionBranch>) {
    onChange(branches.map((branch, branchIndex) => (branchIndex === index ? { ...branch, ...patch } : branch)));
  }

  function updateBranchSteps(index: number, branchSteps: LeafStep[]) {
    updateBranch(index, { steps: branchSteps });
  }

  function removeBranch(index: number) {
    onChange(branches.filter((_, branchIndex) => branchIndex !== index));
  }

  function addBranch() {
    onChange([
      ...branches,
      { operator: "string-eq", variable: "", value: "", steps: [{ id: crypto.randomUUID(), type: "log", message: "Condition met" }] }
    ]);
  }

  return (
    <div className="branches-editor">
      <p className="branches-hint">Branches are checked top to bottom; the first match runs, the rest are skipped.</p>
      {branches.map((branch, index) => (
        <div className="branch-card" key={index}>
          <div className="branch-head">
            <span className="branch-badge">if branch {index + 1}</span>
            <select
              aria-label={`Branch ${index + 1} operator`}
              value={branch.operator}
              onChange={(event) => updateBranch(index, { operator: event.target.value as ConditionOperator })}
            >
              {OPERATOR_GROUPS.map((group) => (
                <optgroup label={group.label} key={group.label}>
                  {group.options.map((option) => (
                    <option value={option.value} key={option.value}>{option.label}</option>
                  ))}
                </optgroup>
              ))}
            </select>
            <button
              className="remove"
              onClick={() => removeBranch(index)}
              disabled={branches.length === 1}
              aria-label={`Remove branch ${index + 1}`}
            >
              ×
            </button>
          </div>
          <div className="inline-fields">
            <input
              value={branch.variable}
              onChange={(event) => updateBranch(index, { variable: event.target.value })}
              placeholder="Variable name, e.g. count"
            />
            {NEEDS_VALUE.includes(branch.operator) && (
              <input
                value={branch.value}
                onChange={(event) => updateBranch(index, { value: event.target.value })}
                placeholder={branch.operator.startsWith("number") ? "Number or {{variable}}" : "Value or {{variable}}"}
              />
            )}
          </div>
          <div className="branch-body">
            <span className="branch-then">then run:</span>
            <StepsEditor steps={branch.steps} onChange={(next) => updateBranchSteps(index, next)} nesting={1} />
          </div>
        </div>
      ))}
      <button className="add-step condition" onClick={addBranch}>＋ Add another branch</button>
    </div>
  );
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
  const [validationErrors, setValidationErrors] = useState<string[]>([]);

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
    setValidationErrors([]);
  }

  function startNewWorkflow() {
    setSelectedId(undefined);
    setName("Untitled workflow");
    setDescription("");
    setSteps([newLeafStep("log")]);
    setRun(undefined);
    setError("");
    setValidationErrors([]);
  }

  async function saveWorkflow() {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setValidationErrors([]);
      setError("Workflow name is required.");
      return;
    }
    // Validate locally before the request so authors get every actionable error
    // without the server ever accepting a definition that could stall at run time.
    const result = validateWorkflowSteps(steps);
    if (!result.valid) {
      setValidationErrors(result.errors);
      setError("Please fix the highlighted problems before saving.");
      return;
    }

    setSaving(true);
    setError("");
    setValidationErrors([]);
    try {
      const input: CreateWorkflowInput = { name: trimmedName, description, steps };
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
    setValidationErrors([]);
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
          {error && <div className="alert">{error}</div>}
          {validationErrors.length > 0 && (
            <div className="alert validation-alert">
              <strong>Cannot save yet:</strong>
              <ul>
                {validationErrors.map((message, index) => <li key={index}>{message}</li>)}
              </ul>
            </div>
          )}

          <div className="builder-grid">
            <div className="builder-card">
              <div className="card-title"><div><span className="step-number">01</span><h2>Details</h2></div><span className="card-hint">IDENTITY</span></div>
              <label>Workflow name<input value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Daily digest" /></label>
              <label>Description <span className="optional">optional</span><textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="What does this workflow automate?" rows={3} /></label>
            </div>

            <div className="builder-card steps-card">
              <div className="card-title"><div><span className="step-number">02</span><h2>Steps</h2></div><span className="card-hint">RUN IN ORDER</span></div>
              <StepsEditor steps={steps} onChange={setSteps} nesting={0} />
            </div>
          </div>

          <section className="run-card"><div className="run-header"><div><p className="eyebrow">OBSERVABILITY</p><h2>Latest run</h2></div>{run ? <span className={`status ${run.status}`}><i /> {run.status}</span> : <span className="status idle"><i /> not started</span>}</div>{run ? <div className="run-content"><div className="run-meta"><span>RUN ID <strong>{run.id.slice(0, 8)}…</strong></span><span>STARTED <strong>{new Date(run.startedAt).toLocaleTimeString()}</strong></span><span>VARIABLES <strong>{Object.keys(run.variables).length}</strong></span></div><div className="log-console">{run.logs.map((log, index) => <div className={`log-line ${log.level}`} key={`${log.at}-${index}`}><time>{new Date(log.at).toLocaleTimeString()}</time><span className="log-bullet">{log.level === "error" ? "!" : "›"}</span><span>{log.message}</span></div>)}{run.logs.length === 0 && <span className="muted">Waiting for execution…</span>}</div></div> : <div className="empty-run"><span className="pulse">◌</span><p>Run this workflow to see live execution logs and variables.</p></div>}</section>
        </section>
      </div>
    </main>
  );
}
