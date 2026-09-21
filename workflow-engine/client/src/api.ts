import type { CreateWorkflowInput, Workflow, WorkflowRun } from "../../shared/types";

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { headers: { "Content-Type": "application/json" }, ...init });
  const body = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new Error(body.error ?? `Request failed: ${response.status}`);
  return body;
}

export const api = {
  listWorkflows: () => request<{ workflows: Workflow[] }>("/api/workflows"),
  getWorkflow: (id: string) => request<{ workflow: Workflow }>(`/api/workflows/${id}`),
  createWorkflow: (input: CreateWorkflowInput) => request<{ workflow: Workflow }>("/api/workflows", { method: "POST", body: JSON.stringify(input) }),
  runWorkflow: (id: string) => request<{ run: WorkflowRun }>(`/api/workflows/${id}/runs`, { method: "POST" }),
  getRun: (id: string) => request<{ run: WorkflowRun }>(`/api/runs/${id}`)
};
