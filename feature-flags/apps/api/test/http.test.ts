import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/http/app.js';
import { InMemoryFlagStore } from '../src/domain/store.js';

async function withServer<T>(callback: (baseUrl: string) => Promise<T>): Promise<T> {
  const server = createApp(new InMemoryFlagStore()).listen(0);
  await new Promise<void>((resolve) => server.once('listening', () => resolve()));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('server did not start');
  try {
    return await callback(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

test('API can create and evaluate a flag', async () => {
  await withServer(async (baseUrl) => {
    const createResponse = await fetch(`${baseUrl}/api/flags`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        key: 'beta-checkout',
        name: 'Beta checkout',
        defaultValue: false,
        rules: [{ type: 'attribute_equals', attribute: 'plan', value: 'pro', serve: true }],
      }),
    });
    assert.equal(createResponse.status, 201);

    const evaluateResponse = await fetch(`${baseUrl}/api/flags/beta-checkout/evaluate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ attributes: { plan: 'pro' } }),
    });
    assert.equal(evaluateResponse.status, 200);
    const payload = await evaluateResponse.json() as { data: { value: boolean; reason: string } };
    assert.deepEqual(payload.data, { value: true, reason: 'attribute_equals' });
  });
});
