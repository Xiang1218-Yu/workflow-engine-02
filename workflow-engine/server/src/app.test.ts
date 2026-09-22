import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";
import { createApp } from "./app.js";
import { WorkflowStore } from "./store.js";
import { MAX_BRANCH_DEPTH, validateWorkflowSteps } from "../../shared/validation.js";
import type { WorkflowStep } from "../../shared/types.js";

async function startTestServer() {
  const server = createApp(new WorkflowStore(false));
  server.listen(0);
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No test port");
  return { server, baseUrl: `http://127.0.0.1:${address.port}` };
}

async function createWorkflow(baseUrl: string, steps: unknown, name = "Test workflow") {
  const response = await fetch(`${baseUrl}/api/workflows`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, steps })
  });
  return response;
}

async function runToCompletion(baseUrl: string, workflowId: string) {
  const runResponse = await fetch(`${baseUrl}/api/workflows/${workflowId}/runs`, { method: "POST" });
  assert.equal(runResponse.status, 202);
  const { run: started } = (await runResponse.json()) as { run: { id: string } };

  let body: { run: { status: string; logs: Array<{ message: string }>; error?: string } } | undefined;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 10));
    const response = await fetch(`${baseUrl}/api/runs/${started.id}`);
    body = (await response.json()) as typeof body;
    if (body && body.run.status !== "queued" && body.run.status !== "running") break;
  }
  assert.ok(body, "run never reported a terminal state");
  assert.notEqual(body.run.status, "running", "run must not stay stuck in running");
  return body.run;
}

test("creates a workflow and executes it", async (t) => {
  const { server, baseUrl } = await startTestServer();
  t.after(() => server.close());

  const createResponse = await createWorkflow(baseUrl, [
    { id: "set-1", type: "set", key: "subject", value: "tests" },
    { id: "log-1", type: "log", message: "Running {{subject}}" },
    { id: "delay-1", type: "delay", durationMs: 1 }
  ]);
  assert.equal(createResponse.status, 201);
  const { workflow } = (await createResponse.json()) as { workflow: { id: string } };

  const run = await runToCompletion(baseUrl, workflow.id);
  assert.equal(run.status, "completed");
  assert.ok(run.logs.some((log) => log.message === "Running tests"));
});

test("rejects invalid workflows", async (t) => {
  const { server, baseUrl } = await startTestServer();
  t.after(() => server.close());
  const response = await fetch(`${baseUrl}/api/workflows`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "", steps: [] })
  });
  assert.equal(response.status, 400);
});

test("runs the then path for a matching string equality condition and logs the skipped else", async (t) => {
  const { server, baseUrl } = await startTestServer();
  t.after(() => server.close());

  const response = await createWorkflow(baseUrl, [
    { id: "set-role", type: "set", key: "role", value: "admin" },
    {
      id: "role-branch",
      type: "branch",
      condition: { left: "{{role}}", operator: "eq", right: "admin" },
      then: [{ id: "then-log", type: "log", message: "welcome admin" }],
      else: [{ id: "else-log", type: "log", message: "welcome guest" }]
    }
  ]);
  assert.equal(response.status, 201);
  const { workflow } = (await response.json()) as { workflow: { id: string } };

  const run = await runToCompletion(baseUrl, workflow.id);
  assert.equal(run.status, "completed");
  const messages = run.logs.map((log) => log.message);
  assert.ok(messages.includes("welcome admin"));
  assert.ok(!messages.includes("welcome guest"));
  assert.ok(messages.some((message) => message.includes("skipping the “else” path")));
});

test("runs the else path when a numeric comparison fails and reports the skipped then path", async (t) => {
  const { server, baseUrl } = await startTestServer();
  t.after(() => server.close());

  const response = await createWorkflow(baseUrl, [
    { id: "set-age", type: "set", key: "age", value: "15" },
    {
      id: "age-branch",
      type: "branch",
      condition: { left: "{{age}}", operator: "gte", right: "18" },
      then: [{ id: "adult", type: "log", message: "adult content" }],
      else: [{ id: "minor", type: "log", message: "minor content" }]
    }
  ]);
  assert.equal(response.status, 201);
  const { workflow } = (await response.json()) as { workflow: { id: string } };

  const run = await runToCompletion(baseUrl, workflow.id);
  assert.equal(run.status, "completed");
  const messages = run.logs.map((log) => log.message);
  assert.ok(messages.includes("minor content"));
  assert.ok(!messages.includes("adult content"));
  assert.ok(messages.some((message) => message.includes("skipping the “then” path")));
});

test("supports nested branches and the variable-not-set condition", async (t) => {
  const { server, baseUrl } = await startTestServer();
  t.after(() => server.close());

  const response = await createWorkflow(baseUrl, [
    {
      id: "token-branch",
      type: "branch",
      condition: { left: "{{token}}", operator: "notExists" },
      then: [
        { id: "missing-log", type: "log", message: "no token" },
        {
          id: "inner-branch",
          type: "branch",
          condition: { left: "{{user}}", operator: "ne", right: "ada" },
          then: [{ id: "inner-log", type: "log", message: "stranger" }]
        }
      ]
    },
    { id: "after", type: "log", message: "done" }
  ]);
  assert.equal(response.status, 201);
  const { workflow } = (await response.json()) as { workflow: { id: string } };

  const run = await runToCompletion(baseUrl, workflow.id);
  assert.equal(run.status, "completed");
  const messages = run.logs.map((log) => log.message);
  assert.ok(messages.includes("no token"));
  assert.ok(messages.includes("stranger"));
  // {{user}} was never set, so string inequality resolves true against the missing literal.
  assert.ok(messages.some((message) => message.includes("Step 1.2: branch")));
  assert.ok(messages.includes("done"));
});

test("fails (rather than hanging) when a numeric condition compares non-numeric runtime values", async (t) => {
  const { server, baseUrl } = await startTestServer();
  t.after(() => server.close());

  const response = await createWorkflow(baseUrl, [
    { id: "set-name", type: "set", key: "name", value: "ada" },
    {
      id: "bad-number",
      type: "branch",
      condition: { left: "{{name}}", operator: "gt", right: "10" },
      then: [{ id: "then-x", type: "log", message: "unreachable" }]
    }
  ]);
  assert.equal(response.status, 201);
  const { workflow } = (await response.json()) as { workflow: { id: string } };

  const run = await runToCompletion(baseUrl, workflow.id);
  assert.equal(run.status, "failed");
  assert.ok(run.error?.includes("not a valid number"));
});

test("old workflows without branches still execute steps in their original order", async (t) => {
  const store = new WorkflowStore(true);
  const { server, baseUrl } = await startTestServer();
  t.after(() => server.close());
  void store;

  // Recreate the seeded shape through the API to prove legacy payloads validate.
  const response = await createWorkflow(baseUrl, [
    { id: "legacy-log", type: "log", message: "Hello {{name}}!" },
    { id: "legacy-set", type: "set", key: "name", value: "workflow builder" },
    { id: "legacy-delay", type: "delay", durationMs: 1 },
    { id: "legacy-done", type: "log", message: "The workflow is complete." }
  ]);
  assert.equal(response.status, 201);
  const { workflow } = (await response.json()) as { workflow: { id: string } };

  const run = await runToCompletion(baseUrl, workflow.id);
  assert.equal(run.status, "completed");
  const info = run.logs.map((log) => log.message);
  const startIndex = info.indexOf("Hello {{name}}!");
  const setIndex = info.findIndex((message) => message === "Set name = workflow builder");
  const doneIndex = info.indexOf("The workflow is complete.");
  assert.ok(startIndex >= 0 && setIndex > startIndex && doneIndex > setIndex);
});

test("rejects empty branch paths with understandable save errors", () => {
  const result = validateWorkflowSteps([
    {
      id: "b1",
      type: "branch",
      condition: { left: "{{x}}", operator: "eq", right: "1" },
      then: [],
      else: []
    }
  ]);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => /“then” path needs at least one step/.test(error)));
  assert.ok(result.errors.some((error) => /“else” path cannot be empty/.test(error)));
});

test("rejects malformed condition expressions with understandable save errors", () => {
  const result = validateWorkflowSteps([
    {
      id: "b1",
      type: "branch",
      condition: { left: "{{na me}}", operator: "gt", right: "abc" },
      then: [{ id: "t1", type: "log", message: "ok" }]
    }
  ]);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => /not a valid variable name/.test(error)));
  assert.ok(result.errors.some((error) => /not a number/.test(error)));
});

test("rejects unclosed templates in log messages", () => {
  const result = validateWorkflowSteps([{ id: "l1", type: "log", message: "Hello {{name" }]);
  assert.equal(result.valid, false);
  assert.ok(result.errors[0].includes("unclosed variable expression"));
});

test("rejects circular branch nesting", () => {
  const thenStep: WorkflowStep = { id: "t1", type: "log", message: "x" };
  const branch: WorkflowStep = {
    id: "b1",
    type: "branch",
    condition: { left: "{{x}}", operator: "eq", right: "1" },
    then: []
  };
  // Build an impossible-but-decodable cyclic structure.
  (branch as Extract<WorkflowStep, { type: "branch" }>).then.push(branch);
  (branch as Extract<WorkflowStep, { type: "branch" }>).then.push(thenStep);

  const result = validateWorkflowSteps([branch]);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => /circular nesting/.test(error)));
});

test("rejects branch nesting deeper than the supported limit", () => {
  let leaf: WorkflowStep = { id: "leaf", type: "log", message: "deep" };
  let current: WorkflowStep = leaf;
  for (let depth = 0; depth <= MAX_BRANCH_DEPTH + 1; depth += 1) {
    current = {
      id: `b${depth}`,
      type: "branch",
      condition: { left: "{{x}}", operator: "eq", right: "1" },
      then: [current]
    };
  }
  const result = validateWorkflowSteps([current]);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => /nested more than/.test(error)));
});

test("rejects duplicate step ids across the whole tree", () => {
  const result = validateWorkflowSteps([
    {
      id: "shared",
      type: "branch",
      condition: { left: "{{x}}", operator: "notExists" },
      then: [{ id: "shared", type: "log", message: "dup" }]
    }
  ]);
  assert.equal(result.valid, false);
  assert.ok(result.errors[0].includes("duplicate step id"));
});
