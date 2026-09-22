export type StepType = "log" | "set" | "delay" | "condition";

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

/** Steps allowed inside a condition branch (branching cannot be nested). */
export type LeafStep = LogStep | SetStep | DelayStep;

/**
 * Operators supported by a condition branch.
 * - string-eq / string-neq compare the raw string value of a variable.
 * - number-* parse both sides as numbers before comparing.
 * - var-missing matches only when the variable was never set.
 */
export type ConditionOperator =
  | "string-eq"
  | "string-neq"
  | "number-eq"
  | "number-neq"
  | "number-gt"
  | "number-gte"
  | "number-lt"
  | "number-lte"
  | "var-missing";

export interface ConditionBranch {
  operator: ConditionOperator;
  /** Variable name to inspect, e.g. "count" or "user.name" (no {{ }} wrappers). */
  variable: string;
  /** Value to compare against (supports {{variable}} interpolation); ignored for var-missing. */
  value: string;
  /** Steps run in order when this is the first branch whose condition matches. */
  steps: LeafStep[];
}

export interface ConditionStep {
  id: string;
  type: "condition";
  /** Evaluated top to bottom; the first matching branch wins. */
  branches: ConditionBranch[];
}

export type WorkflowStep = LeafStep | ConditionStep;

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
