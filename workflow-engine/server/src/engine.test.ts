import assert from "node:assert/strict";
import test from "node:test";
import { executeWorkflow } from "./engine.js";
import { WorkflowStore } from "./store.js";
import type { Workflow } from "../../shared/types.js";

function workflowWith(steps: unknown): Workflow {
  const now = new Date().toISOString();
  return { id: "wf", name: "Broken", description: "", steps: steps as Workflow["steps"], createdAt: now, updatedAt: now };
}

test("invalid workflow fails fast with validation errors instead of staying running", async () => {
  const store = new WorkflowStore(false);
  const run = store.createRun("wf");
  await executeWorkflow(store, workflowWith([]), run);
  const final = store.getRun(run.id);
  assert.equal(final?.status, "failed");
  assert.ok(final?.logs.some((log) => log.message.includes("non-empty array")));
  assert.ok(final?.finishedAt);
});

test("non-numeric string operands skip numeric branches without failing", async () => {
  const store = new WorkflowStore(false);
  const run = store.createRun("wf");
  const workflow = workflowWith([
    { id: "set-x", type: "set", key: "x", value: "soon" },
    {
      id: "cond",
      type: "condition",
      branches: [
        {
          operator: "number-gt",
          variable: "x",
          value: "5",
          steps: [{ id: "log-bad", type: "log", message: "should not run" }]
        }
      ]
    }
  ]);
  await executeWorkflow(store, workflow, run);
  const final = store.getRun(run.id);
  assert.equal(final?.status, "completed");
  const messages = final?.logs.map((log) => log.message) ?? [];
  assert.ok(messages.some((message) => message.includes("not a valid numeric comparison")));
  assert.ok(messages.some((message) => message.includes("no branch matched")));
  assert.ok(!messages.includes("should not run"));
});
