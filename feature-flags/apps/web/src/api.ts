import type { Evaluation, Flag, FlagDraft } from './types';

const apiBase = import.meta.env.VITE_API_BASE_URL ?? '/api';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiBase}${path}`, {
    headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
    ...init,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error ?? `Request failed (${response.status})`);
  return payload.data as T;
}

export const api = {
  listFlags: () => request<Flag[]>('/flags'),
  createFlag: (draft: FlagDraft) => request<Flag>('/flags', { method: 'POST', body: JSON.stringify(draft) }),
  evaluate: (key: string, context: { userId: string; attributes: Record<string, string> }) =>
    request<Evaluation>(`/flags/${encodeURIComponent(key)}/evaluate`, { method: 'POST', body: JSON.stringify(context) }),
};
