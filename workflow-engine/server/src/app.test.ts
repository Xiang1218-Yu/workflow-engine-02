import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";
import { createApp } from "./app.js";
import { WorkflowStore } from "./store.js";

async function startTestServer() {
  const server = createApp(new WorkflowStore(false));
  server.listen(0);
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No test port");
  return { server, baseUrl: `http://127.0.0.1:${address.port}` };
}

test("creates a workflow and executes it", async (t) => {
  const { server, baseUrl } = await startTestServer();
  t.after(() => server.close());

  const createResponse = await fetch(`${baseUrl}/api/workflows`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "Test workflow",
      steps: [
        { id: "set-1", type: "set", key: "subject", value: "tests" },
        { id: "log-1", type: "log", message: "Running {{subject}}" },
        { id: "delay-1", type: "delay", durationMs: 1 }
      ]
    })
  });
  assert.equal(createResponse.status, 201);
  const { workflow } = (await createResponse.json()) as { workflow: { id: string } };

  const runResponse = await fetch(`${baseUrl}/api/workflows/${workflow.id}/runs`, { method: "POST" });
  assert.equal(runResponse.status, 202);
  const { run } = (await runResponse.json()) as { run: { id: string } };

  let status = "queued";
  for (let attempt = 0; attempt < 20 && status !== "completed"; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 10));
    const response = await fetch(`${baseUrl}/api/runs/${run.id}`);
    const body = (await response.json()) as { run: { status: string; logs: Array<{ message: string }> } };
    status = body.run.status;
    if (status === "completed") {
      assert.ok(body.run.logs.some((log) => log.message === "Running tests"));
    }
  }
  assert.equal(status, "completed");
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

async function createWorkflow(baseUrl: string, steps: unknown[]): Promise<string> {
  const response = await fetch(`${baseUrl}/api/workflows`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Conditional workflow", steps })
  });
  const raw = await response.text();
  assert.equal(response.status, 201, `create failed: ${raw}`);
  const body = JSON.parse(raw) as { workflow: { id: string } };
  return body.workflow.id;
}

async function waitForCompletion(baseUrl: string, runId: string) {
  let final: { status: string; logs: Array<{ level: string; message: string }> };
  for (let attempt = 0; attempt < 30; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 10));
    const response = await fetch(`${baseUrl}/api/runs/${runId}`);
    const body = (await response.json()) as { run: { status: string; logs: Array<{ level: string; message: string }> } };
    final = body.run;
    if (final.status !== "queued" && final.status !== "running") return final;
  }
  throw new Error("Run did not finish in time");
}

async function startRun(baseUrl: string, workflowId: string) {
  const response = await fetch(`${baseUrl}/api/workflows/${workflowId}/runs`, { method: "POST" });
  assert.equal(response.status, 202);
  const body = (await response.json()) as { run: { id: string } };
  return waitForCompletion(baseUrl, body.run.id);
}

test("runs the first matching branch and logs every skip", async (t) => {
  const { server, baseUrl } = await startTestServer();
  t.after(() => server.close());

  const id = await createWorkflow(baseUrl, [
    { id: "set-count", type: "set", key: "count", value: "2" },
    {
      id: "cond",
      type: "condition",
      branches: [
        {
          operator: "number-gte",
          variable: "count",
          value: "3",
          steps: [
            { id: "slow-delay", type: "delay", durationMs: 1 },
            { id: "slow-log", type: "log", message: "taking the slow path" }
          ]
        },
        {
          operator: "number-lt",
          variable: "count",
          value: "3",
          steps: [{ id: "fast-log", type: "log", message: "taking the fast path" }]
        },
        {
          operator: "string-eq",
          variable: "count",
          value: "2",
          steps: [{ id: "unreachable", type: "log", message: "should never run" }]
        }
      ]
    },
    { id: "done", type: "log", message: "finished" }
  ]);

  const result = await startRun(baseUrl, id);
  assert.equal(result.status, "completed");
  const messages = result.logs.map((log) => log.message);
  assert.ok(messages.includes("taking the fast path"));
  assert.ok(!messages.includes("taking the slow path"));
  assert.ok(!messages.includes("should never run"));
  assert.ok(messages.some((message) => message.includes("Step 2 branch 1") && message.includes("skipped")));
  assert.ok(messages.some((message) => message.includes("branch 3") && message.includes("already matched")));
  assert.ok(messages.some((message) => message.includes("Step 2.2.1")));
  assert.ok(messages.includes("finished"));
});

test("var-missing matches only absent variables and no-match is reported", async (t) => {
  const { server, baseUrl } = await startTestServer();
  t.after(() => server.close());

  const id = await createWorkflow(baseUrl, [
    {
      id: "cond",
      type: "condition",
      branches: [
        {
          operator: "string-eq",
          variable: "name",
          value: "Ada",
          steps: [{ id: "ada-log", type: "log", message: "hi Ada" }]
        },
        {
          operator: "var-missing",
          variable: "name",
          value: "",
          steps: [{ id: "anon-set", type: "set", key: "name", value: "anonymous" }]
        }
      ]
    }
  ]);

  const result = await startRun(baseUrl, id);
  assert.equal(result.status, "completed");
  const messages = result.logs.map((log) => log.message);
  assert.ok(messages.some((message) => message.includes("variable “name” is not set")));
  assert.ok(messages.some((message) => message.includes("condition met")));
  assert.ok(messages.includes("Set name = anonymous"));
});

test("reports no matching branch without failing", async (t) => {
  const { server, baseUrl } = await startTestServer();
  t.after(() => server.close());

  const id = await createWorkflow(baseUrl, [
    { id: "set-a", type: "set", key: "a", value: "1" },
    {
      id: "cond",
      type: "condition",
      branches: [
        {
          operator: "number-gt",
          variable: "a",
          value: "5",
          steps: [{ id: "big", type: "log", message: "big" }]
        }
      ]
    },
    { id: "after", type: "log", message: "after condition" }
  ]);

  const result = await startRun(baseUrl, id);
  assert.equal(result.status, "completed");
  const messages = result.logs.map((log) => log.message);
  assert.ok(messages.some((message) => message.includes("no branch matched")));
  assert.ok(messages.includes("after condition"));
  assert.ok(!messages.includes("big"));
});

test("rejects malformed condition definitions with readable errors", async (t) => {
  const { server, baseUrl } = await startTestServer();
  t.after(() => server.close());

  const cases: Array<{ name: string; steps: unknown; snippet: string }> = [
    {
      name: "empty branch steps",
      steps: [{ id: "c1", type: "condition", branches: [{ operator: "string-eq", variable: "x", value: "y", steps: [] }] }],
      snippet: "at least one log, set or delay step"
    },
    {
      name: "nested condition",
      steps: [
        {
          id: "c2",
          type: "condition",
          branches: [
            {
              operator: "string-eq",
              variable: "x",
              value: "y",
              steps: [{ id: "inner", type: "condition", branches: [] }]
            }
          ]
        }
      ],
      snippet: "conditions cannot be nested"
    },
    {
      name: "bad numeric value",
      steps: [{ id: "c3", type: "condition", branches: [{ operator: "number-gt", variable: "x", value: "soon", steps: [{ id: "l", type: "log", message: "m" }] }] }],
      snippet: "not a valid number"
    },
    {
      name: "invalid variable expression",
      steps: [{ id: "c4", type: "condition", branches: [{ operator: "string-eq", variable: "{{x}}", value: "y", steps: [{ id: "l2", type: "log", message: "m" }] }] }],
      snippet: "without {{ }} wrappers"
    },
    {
      name: "duplicate ids",
      steps: [
        { id: "dup", type: "log", message: "a" },
        { id: "dup", type: "log", message: "b" }
      ],
      snippet: "duplicate step id"
    }
  ];

  for (const testCase of cases) {
    const response = await fetch(`${baseUrl}/api/workflows`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: testCase.name, steps: testCase.steps })
    });
    assert.equal(response.status, 400, `${testCase.name} should be rejected`);
    const body = (await response.json()) as { error: string };
    assert.ok(body.error.includes(testCase.snippet), `${testCase.name}: expected "${testCase.snippet}" in "${body.error}"`);
  }
});

test("keeps executing legacy log/set/delay workflows in their original order", async (t) => {
  const { server, baseUrl } = await startTestServer();
  t.after(() => server.close());

  // Payload identical to workflows saved before conditions existed.
  const id = await createWorkflow(baseUrl, [
    { id: "old-set", type: "set", key: "subject", value: "legacy" },
    { id: "old-log", type: "log", message: "hello {{subject}}" },
    { id: "old-delay", type: "delay", durationMs: 1 }
  ]);

  const result = await startRun(baseUrl, id);
  assert.equal(result.status, "completed");
  const messages = result.logs.map((log) => log.message);
  const expected = ["Step 1: set", "Set subject = legacy", "Step 2: log", "hello legacy", "Step 3: delay", "Waiting 1 ms."];
  let cursor = 0;
  for (const message of messages) {
    if (message === expected[cursor]) cursor += 1;
  }
  assert.equal(cursor, expected.length, `steps did not run in original order: ${JSON.stringify(messages)}`);
});
