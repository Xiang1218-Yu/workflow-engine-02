import type { IncomingMessage, ServerResponse } from 'node:http';

export async function readJson<T>(request: IncomingMessage): Promise<T> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw) return {} as T;
  try {
    return JSON.parse(raw) as T;
  } catch {
    throw new HttpError(400, '请求体必须是合法 JSON');
  }
}

export function sendJson(response: ServerResponse, statusCode: number, payload: unknown): void {
  const body = JSON.stringify(payload);
  response.statusCode = statusCode;
  response.setHeader('content-type', 'application/json; charset=utf-8');
  response.setHeader('content-length', Buffer.byteLength(body));
  response.end(body);
}

export function sendText(response: ServerResponse, statusCode: number, body: string, headers: Record<string, string> = {}): void {
  response.statusCode = statusCode;
  for (const [key, value] of Object.entries(headers)) response.setHeader(key, value);
  response.end(body);
}

export class HttpError extends Error {
  constructor(public readonly statusCode: number, message: string) {
    super(message);
  }
}

export function methodFromRequest(request: IncomingMessage): string {
  return (request.method || 'GET').toUpperCase();
}
