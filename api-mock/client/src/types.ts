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

export type MockRouteInput = Omit<MockRoute, 'id' | 'createdAt' | 'updatedAt'>;

export interface ReplayResult {
  matched: boolean;
  route?: MockRoute;
  response: { statusCode: number; headers: Record<string, string>; body: string };
}
