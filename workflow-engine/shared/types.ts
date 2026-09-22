export type StepType = "log" | "set" | "delay" | "branch";

export interface LogStep {
  id: string;
  type: "log";
  message: string;
}

export interface SetStep {
  id: string;
  type: "set";
  key: string;
  value: string;
}

export interface DelayStep {
  id: string;
  type: "delay";
  durationMs: number;
}

/**
 * Operators supported by a {@link BranchStep} condition.
 *
 * - `eq` / `ne`: string equality / inequality.
 * - `gt` / `gte` / `lt` / `lte`: numeric comparison (both operands must
 *   resolve to finite numbers).
 * - `notExists`: the referenced variable has never been set.
 */
export type ConditionOperator = "eq" | "ne" | "gt" | "gte" | "lt" | "lte" | "notExists";

export interface BranchCondition {
  /** Literal value or a single `{{variable}}` reference, e.g. `"admin"` or `"{{age}}"`. */
  left: string;
  operator: ConditionOperator;
  /** Omitted for `notExists`; required for every other operator. */
  right?: string;
}

export interface BranchStep {
  id: string;
  type: "branch";
  condition: BranchCondition;
  /** Steps executed when the condition is true. */
  then: WorkflowStep[];
  /** Optional steps executed when the condition is false. */
  else?: WorkflowStep[];
}

export type WorkflowStep = LogStep | SetStep | DelayStep | BranchStep;

export interface Workflow {
  id: string;
  name: string;
  description: string;
  steps: WorkflowStep[];
  createdAt: string;
  updatedAt: string;
}

export type RunStatus = "queued" | "running" | "completed" | "failed";

export interface RunLog {
  at: string;
  level: "info" | "error";
  message: string;
}

export interface WorkflowRun {
  id: string;
  workflowId: string;
  status: RunStatus;
  startedAt: string;
  finishedAt?: string;
  logs: RunLog[];
  variables: Record<string, string>;
  error?: string;
}

export interface CreateWorkflowInput {
  name: string;
  description?: string;
  steps: WorkflowStep[];
}
