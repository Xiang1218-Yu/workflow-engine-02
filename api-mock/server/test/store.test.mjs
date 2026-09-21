import test from 'node:test';
import assert from 'node:assert/strict';
import { MockStore } from '../dist/store.js';
import { findMatchingRoute, pathMatches } from '../dist/matcher.js';

test('matches exact and parameterized paths', () => {
  assert.equal(pathMatches('/users/:id', '/users/42'), true);
  assert.equal(pathMatches('/users/:id', '/users/42/profile'), false);
  assert.equal(pathMatches('/assets/*', '/assets/js/app.js'), true);
});

test('prefers the most specific matching route', () => {
  const store = new MockStore();
  const routes = store.list();
  const matched = findMatchingRoute(routes, 'GET', '/users/42');
  assert.equal(matched?.id, 'seed-user');
});

test('records a request as a mock route', () => {
  const store = new MockStore();
  const route = store.record({
    request: { method: 'POST', path: '/orders' },
    response: { statusCode: 201, body: '{"created":true}' }
  });
  assert.equal(route.method, 'POST');
  assert.equal(route.path, '/orders');
  assert.equal(route.statusCode, 201);
  assert.equal(store.get(route.id)?.responseBody, '{"created":true}');
});
