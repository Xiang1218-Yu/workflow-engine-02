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
