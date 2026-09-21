import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateFlag } from '../src/domain/evaluator.js';
import type { FeatureFlag } from '../src/domain/types.js';

const flag = (overrides: Partial<FeatureFlag> = {}): FeatureFlag => ({
  key: 'checkout-v2',
  name: 'Checkout V2',
  description: '',
  defaultValue: false,
  rules: [],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...overrides,
});

test('attribute equals rules match exact typed values', () => {
  const result = evaluateFlag(flag({ rules: [{ id: 'r1', type: 'attribute_equals', attribute: 'plan', value: 'pro', serve: true }] }), {
    userId: 'u-1',
    attributes: { plan: 'pro' },
  });
  assert.equal(result.value, true);
  assert.equal(result.reason, 'attribute_equals');
});

test('default value is used when no rule matches', () => {
  const result = evaluateFlag(flag({ defaultValue: true, rules: [{ id: 'r1', type: 'attribute_equals', attribute: 'plan', value: 'pro', serve: false }] }), {
    attributes: { plan: 'free' },
  });
  assert.equal(result.value, true);
  assert.equal(result.reason, 'default');
});

test('percentage rules are deterministic for the same user', () => {
  const percentageFlag = flag({ rules: [{ id: 'r1', type: 'percentage', percentage: 50, serve: true }] });
  const first = evaluateFlag(percentageFlag, { userId: 'u-42' });
  const second = evaluateFlag(percentageFlag, { userId: 'u-42' });
  assert.deepEqual(second, first);
  assert.equal(first.reason, 'percentage');
});

test('rules are evaluated in order', () => {
  const result = evaluateFlag(flag({ rules: [
    { id: 'r1', type: 'attribute_equals', attribute: 'plan', value: 'pro', serve: true },
    { id: 'r2', type: 'percentage', percentage: 100, serve: false },
  ] }), { userId: 'u-1', attributes: { plan: 'pro' } });
  assert.equal(result.value, true);
  assert.equal(result.matchedRule?.id, 'r1');
});
