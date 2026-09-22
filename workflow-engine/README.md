# Workflow Engine

A small but extensible configurable automation workflow engine built with React + Vite + TypeScript on the frontend and Node.js + TypeScript on the backend. It is intentionally split into small layers so future GSB tasks can add step types, persistence, authentication, queues, or richer editors without rewriting the baseline.

## Features

- List workflows and create new workflows in the UI.
- Configure ordered `log`, `set`, and `delay` steps.
- Add `branch` steps that choose a `then` / optional `else` path from run variables, with nested branches supported.
- Execute a saved workflow through the API.
- In-memory workflow/run storage with seeded example data.
- Live run status, variables, and execution log polling in the UI.
- Save-time validation (shared by client and server) for malformed expressions, empty branches, and circular/excessively deep nesting.
- Lightweight Node `http` server with no runtime backend dependency.
- Basic API tests using Node's built-in test runner.

## Structure

```text
workflow-engine/
├── client/              # React + Vite UI
│   ├── src/App.tsx      # Builder and run inspector
│   ├── src/api.ts       # Typed API client
│   └── src/styles.css
├── server/
│   ├── src/app.ts       # HTTP API and routing
│   ├── src/engine.ts    # Step execution engine (including branch evaluation)
│   ├── src/store.ts     # In-memory repository
│   └── src/app.test.ts  # API/integration tests
├── shared/
│   ├── types.ts         # Shared workflow and run contracts
│   └── validation.ts    # Save-time step validation with readable errors
└── package.json
```

## Run locally

Requirements: Node.js 20+.

```bash
npm install
npm run dev
```

Open <http://localhost:5173>. The API runs on <http://localhost:3001> and Vite proxies `/api` requests to it.

Useful commands:

```bash
npm test       # API integration tests
npm run typecheck
npm run build  # Compile server and build Vite client
npm start      # Start compiled API (after npm run build)
```

## API

- `GET /api/workflows` — list workflows
- `POST /api/workflows` — create `{ name, description?, steps }`
- `GET /api/workflows/:id` — get one workflow
- `GET /api/workflows/:id/runs` — list runs for a workflow
- `POST /api/workflows/:id/runs` — start an asynchronous run
- `GET /api/runs/:id` — inspect status, logs, and variables

Example step payload:

```json
[
  { "id": "step-1", "type": "set", "key": "name", "value": "Ada" },
  { "id": "step-2", "type": "log", "message": "Hello {{name}}" },
  {
    "id": "step-3",
    "type": "branch",
    "condition": { "left": "{{name}}", "operator": "eq", "right": "admin" },
    "then": [{ "id": "step-3a", "type": "log", "message": "Welcome back, admin" }],
    "else": [{ "id": "step-3b", "type": "log", "message": "Welcome, guest" }]
  },
  { "id": "step-4", "type": "delay", "durationMs": 250 }
]
```

### Branch conditions

- Operands are literals (`"admin"`, `18`) or a single variable reference (`"{{name}}"`). Literals may also embed variables (`"Hello {{name}}"`), while numeric operators require a bare number or a single variable.
- Operators:
  - `eq`, `ne` — string equality / inequality.
  - `gt`, `gte`, `lt`, `lte` — numeric comparison; a non-numeric runtime value fails the run with a clear error instead of hanging.
  - `notExists` — left side is a single `{{variable}}`; matches when that variable has never been set (no right operand).
- Both `then` and `else` paths hold ordinary steps (`log`, `set`, `delay`) and may contain further `branch` steps, addressed in logs as `3.1`, `3.2e.1`, etc.
- Every skipped path is logged explicitly (which path, how many steps, and why).
- Workflows saved before this feature (only `log`/`set`/`delay`) still validate and run in their original order.
- Invalid saves return `400` with an `errors` array, e.g. malformed `{{...}}` expressions, empty `then`/`else` lists, circular nesting, nesting deeper than 20 levels, or duplicate step ids.

## Extension points

- Add a new `StepType` and union member in `shared/types.ts`.
- Implement its execution behavior in `server/src/engine.ts`.
- Extend validation in `server/src/store.ts`.
- Add an editor branch in `client/src/App.tsx`.
- Replace `WorkflowStore` with a database-backed repository while keeping the HTTP contract stable.

The current store is intentionally in-memory; restarting the server resets data.
