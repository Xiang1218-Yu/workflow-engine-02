import type { BranchCondition, BranchStep, ConditionOperator, Workflow, WorkflowRun, WorkflowStep } from "../../shared/types.js";
import { WorkflowStore } from "./store.js";

const MAX_DELAY_MS = 60_000;
const NUMERIC_OPERATORS: ConditionOperator[] = ["gt", "gte", "lt", "lte"];
const OPERATOR_LABEL: Record<ConditionOperator, string> = {
  eq: "equals",
  ne: "does not equal",
  gt: "is greater than",
  gte: "is at least",
  lt: "is less than",
  lte: "is at most",
  notExists: "is not set"
};

function interpolate(value: string, variables: Record<string, string>): string {
  return value.replace(/{{\s*([\w.-]+)\s*}}/g, (_, key: string) => (key in variables ? variables[key] : `{{${key}}}`));
}

/**
 * Resolves a condition operand. A single `{{variable}}` reference resolves to
 * the variable's value, or `undefined` when it has never been set. Any other
 * operand is treated as a literal (embedded variables are interpolated).
 */
function resolveOperand(operand: string, variables: Record<string, string>): string | undefined {
  const single = /^\s*{{\s*([\w.-]+)\s*}}\s*$/.exec(operand);
  if (single) {
    const key = single[1];
    return key in variables ? variables[key] : undefined;
  }
  return interpolate(operand, variables);
}

function describeOperand(value: string | undefined): string {
  if (value === undefined) return "<not set>";
  if (value === "") return '""';
  return `“${value}”`;
}

function toNumber(value: string | undefined, label: string, position: string): number {
  if (value === undefined) throw new Error(`Step ${position}: ${label} is not set, so it cannot be compared as a number.`);
  const trimmed = value.trim();
  const number = Number(trimmed);
  if (trimmed === "" || !Number.isFinite(number)) {
    throw new Error(`Step ${position}: ${label} “${value}” is not a valid number.`);
  }
  return number;
}

/**
 * Evaluates a branch condition. Throws with a step-prefixed message when the
 * runtime values make comparison impossible (e.g. comparing text numerically);
 * the run is then marked failed rather than hanging in “running”.
 */
function evaluateCondition(condition: BranchCondition, variables: Record<string, string>, position: string): { matched: boolean; description: string } {
  const operator = condition.operator;

  if (operator === "notExists") {
    const single = /^\s*{{\s*([\w.-]+)\s*}}\s*$/.exec(condition.left);
    if (!single) throw new Error(`Step ${position}: “notExists” needs a single {{variable}} on its left side.`);
    const key = single[1];
    const matched = !(key in variables);
    return { matched, description: `variable “{{${key}}}” ${OPERATOR_LABEL[operator]} (${matched ? "absent" : "present"})` };
  }

  const left = resolveOperand(condition.left, variables);
  const right = condition.right === undefined ? undefined : resolveOperand(condition.right, variables);
  const description = `${describeOperand(left)} ${OPERATOR_LABEL[operator]} ${describeOperand(right)}`;

  let matched: boolean;
  if (NUMERIC_OPERATORS.includes(operator)) {
    const leftNumber = toNumber(left, "left operand", position);
    const rightNumber = toNumber(right, "right operand", position);
    matched = operator === "gt" ? leftNumber > rightNumber
      : operator === "gte" ? leftNumber >= rightNumber
      : operator === "lt" ? leftNumber < rightNumber
      : leftNumber <= rightNumber;
  } else {
    matched = operator === "eq" ? left === right : left !== right;
  }
  return { matched, description };
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function executeWorkflow(store: WorkflowStore, workflow: Workflow, run: WorkflowRun): Promise<void> {
  store.updateRun(run.id, { status: "running" });
  store.appendLog(run.id, "info", `Started workflow “${workflow.name}”.`);

  try {
    await executeStepList(store, run.id, workflow.steps, "");
    store.updateRun(run.id, { status: "completed", finishedAt: new Date().toISOString() });
    store.appendLog(run.id, "info", "Workflow completed successfully.");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown execution error";
    store.appendLog(run.id, "error", message);
    store.updateRun(run.id, { status: "failed", error: message, finishedAt: new Date().toISOString() });
  }
}

async function executeStepList(store: WorkflowStore, runId: string, steps: WorkflowStep[], prefix: string): Promise<void> {
  for (const [index, step] of steps.entries()) {
    await executeStep(store, runId, step, `${prefix}${index + 1}`);
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

  if (step.type === "branch") {
    await executeBranch(store, runId, step, position);
    return;
  }

  throw new Error(`Step ${position}: unsupported step type “${(step as { type?: unknown }).type}”.`);
}

async function executeBranch(store: WorkflowStore, runId: string, step: BranchStep, position: string): Promise<void> {
  const run = store.getRun(runId);
  if (!run) throw new Error("Run disappeared while executing");

  const { matched, description } = evaluateCondition(step.condition, run.variables, position);
  if (matched) {
    store.appendLog(runId, "info", `Step ${position}: condition matched — ${description}. Taking the “then” path.`);
    if (step.else && step.else.length > 0) {
      store.appendLog(runId, "info", `Step ${position}: skipping the “else” path (${step.else.length} ${step.else.length === 1 ? "step" : "steps"}) because the condition matched.`);
    }
    await executeStepList(store, runId, step.then, `${position}.`);
  } else {
    store.appendLog(runId, "info", `Step ${position}: condition did not match — ${description}.`);
    if (step.else && step.else.length > 0) {
      store.appendLog(runId, "info", `Step ${position}: skipping the “then” path (${step.then.length} ${step.then.length === 1 ? "step" : "steps"}) and taking the “else” path.`);
      await executeStepList(store, runId, step.else, `${position}e.`);
    } else {
      store.appendLog(runId, "info", `Step ${position}: skipping the “then” path (${step.then.length} ${step.then.length === 1 ? "step" : "steps"}); no “else” path is configured.`);
    }
  }
}
