export type StepType = "log" | "set" | "delay";

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

export type WorkflowStep = LogStep | SetStep | DelayStep;

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
