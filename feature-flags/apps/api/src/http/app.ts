import express, { type ErrorRequestHandler, type RequestHandler } from 'express';
import cors from 'cors';
import { evaluateFlag } from '../domain/evaluator.js';
import { DuplicateFlagError, InMemoryFlagStore, MissingFlagError } from '../domain/store.js';
import { validateFlagInput, ValidationError } from '../domain/validation.js';
import type { EvaluationContext } from '../domain/types.js';

const seedFlags = [
  {
    key: 'new-dashboard',
    name: 'New dashboard',
    description: 'Example flag seeded for a quick first evaluation.',
    defaultValue: false,
    rules: [{ type: 'percentage' as const, percentage: 25, serve: true }],
  },
];

export function createApp(store = new InMemoryFlagStore(seedFlags)) {
  const app = express();
  app.use(cors());
  app.use(express.json());

  const asyncRoute = (handler: RequestHandler): RequestHandler => (request, response, next) => {
    Promise.resolve(handler(request, response, next)).catch(next);
  };

  app.get('/api/health', (_request, response) => response.json({ status: 'ok' }));

  app.get('/api/flags', (_request, response) => response.json({ data: store.list() }));

  app.post('/api/flags', asyncRoute((request, response) => {
    const input = validateFlagInput(request.body);
    response.status(201).json({ data: store.create(input) });
  }));

  app.get('/api/flags/:key', (request, response) => {
    response.json({ data: store.get(request.params.key) });
  });

  app.put('/api/flags/:key', asyncRoute((request, response) => {
    const input = validateFlagInput(request.body);
    response.json({ data: store.update(request.params.key, input) });
  }));

  app.delete('/api/flags/:key', (request, response) => {
    store.delete(request.params.key);
    response.status(204).send();
  });

  app.post('/api/flags/:key/evaluate', (request, response) => {
    const context = request.body && typeof request.body === 'object'
      ? request.body as EvaluationContext
      : {};
    response.json({ data: evaluateFlag(store.get(request.params.key), context) });
  });

  const errorHandler: ErrorRequestHandler = (error, _request, response, _next) => {
    const status = error instanceof ValidationError || error instanceof DuplicateFlagError || error instanceof MissingFlagError
      ? error.statusCode
      : 500;
    response.status(status).json({ error: error instanceof Error ? error.message : 'Internal server error' });
  };
  app.use(errorHandler);
  return app;
}
