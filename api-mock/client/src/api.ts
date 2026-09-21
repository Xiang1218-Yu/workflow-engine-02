import type { MockRoute, MockRouteInput, ReplayResult } from './types';

async function request<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
  const response = await fetch(input, {
    headers: { 'content-type': 'application/json', ...(init?.headers || {}) },
    ...init
  });
  const payload = response.status === 204 ? undefined : await response.json();
  if (!response.ok) throw new Error(payload?.error || `请求失败 (${response.status})`);
  return payload as T;
}

export async function listMocks(): Promise<MockRoute[]> {
  const result = await request<{ data: MockRoute[] }>('/api/mocks');
  return result.data;
}

export async function saveMock(input: MockRouteInput, id?: string): Promise<MockRoute> {
  const result = await request<{ data: MockRoute }>(id ? `/api/mocks/${id}` : '/api/mocks', {
    method: id ? 'PUT' : 'POST',
    body: JSON.stringify(input)
  });
  return result.data;
}

export async function deleteMock(id: string): Promise<void> {
  await request(`/api/mocks/${id}`, { method: 'DELETE' });
}

export async function replayMock(input: { method: MockRoute['method']; path: string; body: string }): Promise<ReplayResult> {
  return request<ReplayResult>('/api/replay', { method: 'POST', body: JSON.stringify(input) });
}
