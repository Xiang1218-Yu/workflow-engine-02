import type { HttpMethod, MockRoute } from './types.js';
import { normalizePath } from './store.js';

export function pathMatches(pattern: string, actual: string): boolean {
  const patternParts = normalizePath(pattern).split('/').filter(Boolean);
  const actualParts = normalizePath(actual).split('/').filter(Boolean);

  let actualIndex = 0;
  for (const patternPart of patternParts) {
    if (patternPart === '*') return true;
    const actualPart = actualParts[actualIndex];
    if (actualPart === undefined) return false;
    if (!patternPart.startsWith(':') && patternPart !== actualPart) return false;
    actualIndex += 1;
  }
  return actualIndex === actualParts.length;
}

export function findMatchingRoute(routes: MockRoute[], method: HttpMethod, path: string): MockRoute | undefined {
  return routes
    .filter((route) => route.method === method && pathMatches(route.path, path))
    .sort((a, b) => scorePath(b.path) - scorePath(a.path))[0];
}

function scorePath(path: string): number {
  return normalizePath(path)
    .split('/')
    .filter(Boolean)
    .reduce((score, part) => score + (part === '*' ? 0 : part.startsWith(':') ? 1 : 2), 0);
}
