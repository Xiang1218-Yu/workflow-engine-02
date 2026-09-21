import type { Workflow, WorkflowRun, WorkflowStep } from "../../shared/types.js";
import { WorkflowStore } from "./store.js";

const MAX_DELAY_MS = 60_000;

function interpolate(value: string, variables: Record<string, string>): string {
  return value.replace(/{{\s*([\w.-]+)\s*}}/g, (_, key: string) => variables[key] ?? `{{${key}}}`);
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function executeWorkflow(store: WorkflowStore, workflow: Workflow, run: WorkflowRun): Promise<void> {
  store.updateRun(run.id, { status: "running" });
  store.appendLog(run.id, "info", `Started workflow “${workflow.name}”.`);

  try {
    for (const [index, step] of workflow.steps.entries()) {
      await executeStep(store, run.id, step, index + 1);
    }
    store.updateRun(run.id, { status: "completed", finishedAt: new Date().toISOString() });
    store.appendLog(run.id, "info", "Workflow completed successfully.");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown execution error";
    store.appendLog(run.id, "error", message);
    store.updateRun(run.id, { status: "failed", error: message, finishedAt: new Date().toISOString() });
  }
}

async function executeStep(store: WorkflowStore, runId: string, step: WorkflowStep, position: number): Promise<void> {
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

  const durationMs = Math.min(Math.max(0, step.durationMs), MAX_DELAY_MS);
  store.appendLog(runId, "info", `Waiting ${durationMs} ms.`);
  await wait(durationMs);
}
