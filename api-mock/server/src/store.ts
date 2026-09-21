import { randomUUID } from 'node:crypto';
import type { MockRoute, MockRouteInput } from './types.js';

const now = () => new Date().toISOString();

const seedRoutes: MockRoute[] = [
  {
    id: 'seed-health',
    name: '健康检查',
    method: 'GET',
    path: '/health',
    statusCode: 200,
    responseHeaders: { 'content-type': 'application/json' },
    responseBody: JSON.stringify({ ok: true, service: 'api-mock' }, null, 2),
    description: '用于确认 Mock 服务是否可用。',
    createdAt: now(),
    updatedAt: now()
  },
  {
    id: 'seed-user',
    name: '用户详情',
    method: 'GET',
    path: '/users/:id',
    statusCode: 200,
    responseHeaders: { 'content-type': 'application/json' },
    responseBody: JSON.stringify({ id: 'demo', name: 'Ada Lovelace', role: 'admin' }, null, 2),
    description: '演示动态路径参数匹配。',
    createdAt: now(),
    updatedAt: now()
  }
];

export class MockStore {
  private routes = new Map<string, MockRoute>(seedRoutes.map((route) => [route.id, route]));

  list(): MockRoute[] {
    return [...this.routes.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  get(id: string): MockRoute | undefined {
    return this.routes.get(id);
  }

  create(input: MockRouteInput): MockRoute {
    const timestamp = now();
    const route: MockRoute = {
      id: randomUUID(),
      name: input.name,
      method: input.method,
      path: normalizePath(input.path),
      statusCode: input.statusCode,
      responseHeaders: input.responseHeaders ?? { 'content-type': 'application/json' },
      responseBody: input.responseBody ?? '',
      description: input.description ?? '',
      createdAt: timestamp,
      updatedAt: timestamp
    };
    this.routes.set(route.id, route);
    return route;
  }

  update(id: string, input: MockRouteInput): MockRoute | undefined {
    const current = this.routes.get(id);
    if (!current) return undefined;
    const route: MockRoute = {
      ...current,
      name: input.name,
      method: input.method,
      path: normalizePath(input.path),
      statusCode: input.statusCode,
      responseHeaders: input.responseHeaders ?? {},
      responseBody: input.responseBody ?? '',
      description: input.description ?? '',
      updatedAt: now()
    };
    this.routes.set(id, route);
    return route;
  }

  delete(id: string): boolean {
    return this.routes.delete(id);
  }

  record(input: {
    name?: string;
    request: { method: MockRouteInput['method']; path: string };
    response: { statusCode: number; headers?: Record<string, string>; body?: string };
  }): MockRoute {
    return this.create({
      name: input.name || `录制 ${input.request.method} ${input.request.path}`,
      method: input.request.method,
      path: input.request.path,
      statusCode: input.response.statusCode,
      responseHeaders: input.response.headers,
      responseBody: input.response.body,
      description: '由录制接口生成'
    });
  }
}

export function normalizePath(path: string): string {
  if (!path) return '/';
  const withoutQuery = path.split('?')[0] || '/';
  const withLeadingSlash = withoutQuery.startsWith('/') ? withoutQuery : `/${withoutQuery}`;
  return withLeadingSlash.length > 1 ? withLeadingSlash.replace(/\/+$/, '') : '/';
}
