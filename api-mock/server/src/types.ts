export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'OPTIONS' | 'HEAD';

export interface MockRoute {
  id: string;
  name: string;
  method: HttpMethod;
  path: string;
  statusCode: number;
  responseHeaders: Record<string, string>;
  responseBody: string;
  description: string;
  createdAt: string;
  updatedAt: string;
}

export interface MockRouteInput {
  name: string;
  method: HttpMethod;
  path: string;
  statusCode: number;
  responseHeaders?: Record<string, string>;
  responseBody?: string;
  description?: string;
}

export interface ReplayRequest {
  method: HttpMethod;
  path: string;
  headers?: Record<string, string>;
  body?: string;
}
