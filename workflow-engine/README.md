# Workflow Engine

A small but extensible configurable automation workflow engine built with React + Vite + TypeScript on the frontend and Node.js + TypeScript on the backend. It is intentionally split into small layers so future GSB tasks can add step types, persistence, authentication, queues, or richer editors without rewriting the baseline.

## Features

- List workflows and create new workflows in the UI.
- Configure ordered `log`, `set`, and `delay` steps, plus `condition` branches.
- Branch on runtime variables: string equality/inequality, numeric comparisons, and "variable does not exist".
- Branches are checked top to bottom; the first match runs its own `log`/`set`/`delay` steps and every skip is logged. Nesting conditions inside branches is rejected on save.
- Execute a saved workflow through the API.
- Workflow definitions are validated with readable, location-aware errors both in the editor (before save) and on the server (before a run starts), so malformed workflows fail fast instead of getting stuck in `running`.
- In-memory workflow/run storage with seeded example data.
- Live run status, variables, and execution log polling in the UI.
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
│   ├── src/engine.ts    # Step execution engine
│   ├── src/store.ts     # In-memory repository
│   └── src/app.test.ts  # API/integration tests
├── shared/
│   ├── types.ts         # Shared workflow and run contracts
│   └── validation.ts    # Isomorphic step validation (server + browser)
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
  {
    "id": "step-2",
    "type": "condition",
    "branches": [
      {
        "operator": "var-missing",
        "variable": "name",
        "value": "",
        "steps": [
          { "id": "step-2a", "type": "log", "message": "Running anonymously" }
        ]
      },
      {
        "operator": "string-eq",
        "variable": "name",
        "value": "Ada",
        "steps": [
          { "id": "step-2b", "type": "log", "message": "Hello {{name}}" },
          { "id": "step-2c", "type": "delay", "durationMs": 250 }
        ]
      }
    ]
  },
  { "id": "step-3", "type": "delay", "durationMs": 250 }
]
```

### Condition operators

| Operator | Meaning | `value` |
| --- | --- | --- |
| `string-eq` / `string-neq` | Raw string equality / inequality | string or `{{variable}}` |
| `number-eq` / `number-neq` / `number-gt` / `number-gte` / `number-lt` / `number-lte` | Numeric comparison after parsing both sides | number or `{{variable}}` |
| `var-missing` | Matches only when the variable was never `set` | ignored |

Branches are evaluated in order and the first match wins; the rest log that they were skipped. When nothing matches, the engine logs `no branch matched` and continues with the next top-level step. Missing variables and non-numeric operands make a branch skip with an explanatory log rather than failing the run.

Validation (enforced in the editor and on the API) rejects: unknown operators, malformed variable names (including `{{x}}` wrappers), non-numeric comparison values, empty branches, conditions nested inside a branch, duplicate step ids, and any of the existing `log`/`set`/`delay` field errors. Workflows saved before this feature contain only leaf steps and continue to run unchanged in their original order.

## Extension points

- Add a new `StepType` and union member in `shared/types.ts`.
- If it can be configured, extend `validateWorkflowSteps` in `shared/validation.ts` so the editor, API, and engine guard all reject bad definitions.
- Implement its execution behavior in `server/src/engine.ts`.
- Add an editor branch in the recursive `StepsEditor` in `client/src/App.tsx`.
- Replace `WorkflowStore` with a database-backed repository while keeping the HTTP contract stable.

The current store is intentionally in-memory; restarting the server resets data.
