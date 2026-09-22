import { randomUUID } from "node:crypto";
import type { CreateWorkflowInput, Workflow, WorkflowRun } from "../../shared/types.js";
import { validateWorkflowSteps } from "../../shared/validation.js";

export class WorkflowStore {
  private readonly workflows = new Map<string, Workflow>();
  private readonly runs = new Map<string, WorkflowRun>();

  constructor(seed = true) {
    if (seed) {
      const now = new Date().toISOString();
      const sample: Workflow = {
        id: "welcome-workflow",
        name: "Welcome workflow",
        description: "A small example that demonstrates logs, variables, and a delay.",
        steps: [
          { id: "welcome-log", type: "log", message: "Hello {{name}}!" },
          { id: "welcome-set", type: "set", key: "name", value: "workflow builder" },
          { id: "welcome-delay", type: "delay", durationMs: 250 },
          { id: "welcome-done", type: "log", message: "The workflow is complete." }
        ],
        createdAt: now,
        updatedAt: now
      };
      this.workflows.set(sample.id, sample);
    }
  }

  listWorkflows(): Workflow[] {
    return [...this.workflows.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  getWorkflow(id: string): Workflow | undefined {
    return this.workflows.get(id);
  }

  createWorkflow(input: CreateWorkflowInput): Workflow {
    const now = new Date().toISOString();
    const workflow: Workflow = {
      id: randomUUID(),
      name: input.name.trim(),
      description: (input.description ?? "").trim(),
      steps: input.steps,
      createdAt: now,
      updatedAt: now
    };
    this.workflows.set(workflow.id, workflow);
    return workflow;
  }

  createRun(workflowId: string): WorkflowRun {
    const run: WorkflowRun = {
      id: randomUUID(),
      workflowId,
      status: "queued",
      startedAt: new Date().toISOString(),
      logs: [],
      variables: {}
    };
    this.runs.set(run.id, run);
    return run;
  }

  getRun(id: string): WorkflowRun | undefined {
    return this.runs.get(id);
  }

  listRuns(workflowId: string): WorkflowRun[] {
    return [...this.runs.values()]
      .filter((run) => run.workflowId === workflowId)
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  }

  updateRun(id: string, update: Partial<WorkflowRun>): WorkflowRun {
    const run = this.runs.get(id);
    if (!run) throw new Error(`Run ${id} not found`);
    Object.assign(run, update);
    return run;
  }

  appendLog(id: string, level: "info" | "error", message: string): void {
    const run = this.runs.get(id);
    if (!run) throw new Error(`Run ${id} not found`);
    run.logs.push({ at: new Date().toISOString(), level, message });
  }

  setVariable(id: string, key: string, value: string): void {
    const run = this.runs.get(id);
    if (!run) throw new Error(`Run ${id} not found`);
    run.variables[key] = value;
  }
}

export { validateSteps } from "../../shared/validation.js";

/** Detailed validation result, re-exported so callers can import it from the store layer too. */
export function validateWorkflow(steps: unknown) {
  return validateWorkflowSteps(steps);
}
