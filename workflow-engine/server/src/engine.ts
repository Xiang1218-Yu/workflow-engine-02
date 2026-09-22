import type { ConditionBranch, ConditionOperator, Workflow, WorkflowRun, WorkflowStep } from "../../shared/types.js";
import { validateWorkflowSteps } from "../../shared/validation.js";
import { WorkflowStore } from "./store.js";

const MAX_DELAY_MS = 60_000;

function interpolate(value: string, variables: Record<string, string>): string {
  return value.replace(/{{\s*([\w.-]+)\s*}}/g, (_, key: string) =>
    Object.hasOwn(variables, key) ? variables[key] : `{{${key}}}`
  );
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function describeOperator(operator: ConditionOperator): string {
  switch (operator) {
    case "string-eq": return "equals";
    case "string-neq": return "does not equal";
    case "number-eq": return "=";
    case "number-neq": return "≠";
    case "number-gt": return ">";
    case "number-gte": return "≥";
    case "number-lt": return "<";
    case "number-lte": return "≤";
    case "var-missing": return "is missing";
  }
}

function describeCondition(branch: ConditionBranch): string {
  const base = `{{${branch.variable}}} ${describeOperator(branch.operator)}`;
  return branch.operator === "var-missing" ? base : `${base} ${branch.value}`;
}

interface ConditionOutcome {
  matched: boolean;
  reason: string;
}

/**
 * Evaluate one branch against the current variables. Returns false together
 * with a human-readable reason whenever data is missing or cannot be parsed, so
 * a bad variable never crashes (or stalls) a run — the branch is simply skipped.
 */
function evaluateBranch(branch: ConditionBranch, variables: Record<string, string>): ConditionOutcome {
  const present = Object.hasOwn(variables, branch.variable);
  const current = present ? variables[branch.variable] : undefined;

  if (branch.operator === "var-missing") {
    return !present
      ? { matched: true, reason: `variable “${branch.variable}” is not set` }
      : { matched: false, reason: `variable “${branch.variable}” exists (value “${current}”), not missing` };
  }

  if (!present) {
    return { matched: false, reason: `variable “${branch.variable}” is not set` };
  }

  const expected = interpolate(branch.value, variables);
  const value = current as string;

  if (branch.operator === "string-eq") {
    return value === expected
      ? { matched: true, reason: `“${value}” equals “${expected}”` }
      : { matched: false, reason: `“${value}” does not equal “${expected}”` };
  }
  if (branch.operator === "string-neq") {
    return value !== expected
      ? { matched: true, reason: `“${value}” does not equal “${expected}”` }
      : { matched: false, reason: `“${value}” equals “${expected}”` };
  }

  const left = Number(value.trim());
  const right = Number(expected.trim());
  if (!Number.isFinite(left) || !Number.isFinite(right)) {
    return { matched: false, reason: `“${value}” vs “${expected}” is not a valid numeric comparison` };
  }
  const checks: Record<Exclude<ConditionOperator, "string-eq" | "string-neq" | "var-missing">, boolean> = {
    "number-eq": left === right,
    "number-neq": left !== right,
    "number-gt": left > right,
    "number-gte": left >= right,
    "number-lt": left < right,
    "number-lte": left <= right
  };
  const matched = checks[branch.operator as keyof typeof checks];
  return { matched, reason: `${left} ${describeOperator(branch.operator)} ${right} is ${matched}` };
}

export async function executeWorkflow(store: WorkflowStore, workflow: Workflow, run: WorkflowRun): Promise<void> {
  // Validate before flipping the run to "running": an invalid definition fails
  // fast with actionable errors instead of leaving the run stuck.
  const validation = validateWorkflowSteps(workflow.steps);
  if (!validation.valid) {
    store.appendLog(run.id, "error", "Refusing to run workflow: its steps are invalid.");
    for (const message of validation.errors) store.appendLog(run.id, "error", message);
    store.updateRun(run.id, { status: "failed", error: validation.errors.join(" "), finishedAt: new Date().toISOString() });
    return;
  }

  store.updateRun(run.id, { status: "running" });
  store.appendLog(run.id, "info", `Started workflow “${workflow.name}”.`);

  try {
    for (const [index, step] of workflow.steps.entries()) {
      await executeStep(store, run.id, step, `${index + 1}`);
    }
    store.updateRun(run.id, { status: "completed", finishedAt: new Date().toISOString() });
    store.appendLog(run.id, "info", "Workflow completed successfully.");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown execution error";
    store.appendLog(run.id, "error", message);
    store.updateRun(run.id, { status: "failed", error: message, finishedAt: new Date().toISOString() });
  }
}

async function executeStep(store: WorkflowStore, runId: string, step: WorkflowStep, position: string): Promise<void> {
  store.appendLog(runId, "info", `Step ${position}: ${step.type}`);
  const run = store.getRun(runId);
  if (!run) throw new Error("Run disappeared while executing");

  if (step.type === "log") {
    store.appendLog(runId, "info", interpolate(step.message, run.variables));
    return;
  }

  if (step.type === "set") {
    const value = interpolate(step.value, run.variables);
    store.setVariable(runId, step.key, value);
    store.appendLog(runId, "info", `Set ${step.key} = ${value}`);
    return;
  }

  if (step.type === "delay") {
    const durationMs = Math.min(Math.max(0, step.durationMs), MAX_DELAY_MS);
    store.appendLog(runId, "info", `Waiting ${durationMs} ms.`);
    await wait(durationMs);
    return;
  }

  await executeCondition(store, runId, step, position);
}

async function executeCondition(store: WorkflowStore, runId: string, step: Extract<WorkflowStep, { type: "condition" }>, position: string): Promise<void> {
  const run = store.getRun(runId);
  if (!run) throw new Error("Run disappeared while executing");

  let matchedIndex = -1;
  step.branches.forEach((branch, branchIndex) => {
    const outcome = evaluateBranch(branch, run.variables);
    const prefix = `Step ${position} branch ${branchIndex + 1} (if ${describeCondition(branch)}):`;
    if (matchedIndex === -1 && outcome.matched) {
      matchedIndex = branchIndex;
      store.appendLog(runId, "info", `${prefix} condition met (${outcome.reason}); running ${branch.steps.length} step${branch.steps.length === 1 ? "" : "s"}.`);
    } else if (matchedIndex === -1) {
      store.appendLog(runId, "info", `${prefix} skipped — ${outcome.reason}.`);
    } else {
      store.appendLog(runId, "info", `${prefix} skipped — branch ${matchedIndex + 1} already matched.`);
    }
  });

  if (matchedIndex === -1) {
    store.appendLog(runId, "info", `Step ${position}: no branch matched; skipping all ${step.branches.length} branches.`);
    return;
  }

  const branch = step.branches[matchedIndex];
  for (const [branchStepIndex, branchStep] of branch.steps.entries()) {
    await executeStep(store, runId, branchStep, `${position}.${matchedIndex + 1}.${branchStepIndex + 1}`);
  }
  store.appendLog(runId, "info", `Step ${position}: branch ${matchedIndex + 1} finished.`);
}
