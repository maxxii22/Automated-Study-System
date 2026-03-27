# Automated Study Systems

Scalable AI-powered study guide and flashcard generator built with React, Node.js, Gemini, PostgreSQL, Redis, BullMQ, Socket.IO, and Prisma.

## Workspace Layout

- `client` - frontend application
- `server` - backend API and Prisma schema
- `shared` - shared TypeScript contracts
- `scripts` - load and failure-drill utilities for the live stack

## Local Development

1. Add `GEMINI_API_KEY=your_key` to `server/.env`.
2. Add `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and optionally `SUPABASE_ADMIN_USER_IDS` to `server/.env`.
3. Add `DATABASE_URL`, `DIRECT_URL`, and `REDIS_URL`.
4. Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` to `client/.env.local`.
5. Optionally set task-specific Gemini models such as `GEMINI_TEXT_MODEL`, `GEMINI_MULTIMODAL_MODEL`, `GEMINI_EXAM_MODEL`, and `GEMINI_RESCUE_MODEL`.
6. Start the API with `npm run dev:server`.
7. Start the worker with `npm run dev:worker`.
8. Start the frontend with `npm run dev:client`.
9. Open `http://localhost:5173`.

## Current State

- Async PDF generation runs through BullMQ workers with Socket.IO updates and HTTP fallback.
- Study sets, flashcards, jobs, and documents are persisted in PostgreSQL through Prisma.
- Supabase Auth now scopes study sets, jobs, exam sessions, and semantic cache access to the signed-in user.
- Exact-document caching and pgvector-backed semantic reuse are enabled.
- Text-heavy flows can now use different Gemini models than PDF/audio flows.
- The backend exposes health, readiness, metrics, queue ops, study-set pagination, and job recovery endpoints.
- Docker Compose now includes healthchecks, restart policies, Redis `noeviction`, and separate API/worker/client services.

## Observability

- `GET /api/health` returns service, queue, vector, and worker heartbeat status.
- `GET /api/ready` returns a lightweight readiness signal for deployment checks.
- `GET /api/metrics` returns Prometheus-style counters and gauges for:
  - API traffic and error rates
  - queue depth
  - worker heartbeat age
  - Gemini request/failure/rate-limit totals
  - study job create/complete/fail/retry/recovery totals
  - PDF extraction failures

## Queue Ops

- `GET /api/study-jobs/ops/summary`
- `POST /api/study-jobs/:id/retry`
- `POST /api/study-jobs/ops/recover-stale`

Notes:
- `/api/study-jobs/:id/retry` is user-scoped.
- `/api/study-jobs/ops/*` requires an authenticated admin user whose Supabase user id is listed in `SUPABASE_ADMIN_USER_IDS`.

## Load And Failure Drills

- `npm run test:load`
  Sends concurrent text-generation requests against `BASE_URL` and prints latency/success summary.
- `npm run test:queue`
  Inspects queue health and can optionally recover stale jobs or retry failed jobs.

Examples:

```powershell
$env:BASE_URL="http://localhost:4000/api"
$env:ACCESS_TOKEN="your_supabase_access_token"
$env:LOAD_REQUESTS="10"
$env:LOAD_CONCURRENCY="3"
npm run test:load
```

```powershell
$env:BASE_URL="http://localhost:4000/api"
$env:ACCESS_TOKEN="your_admin_supabase_access_token"
$env:RECOVER_STALE="true"
$env:RETRY_FAILED="true"
npm run test:queue
```

## Container Deployment

Run:

```powershell
docker compose up --build
```

This starts:
- `postgres`
- `redis`
- `api`
- `worker`
- `client`

The API is served on `http://localhost:4000` and the client on `http://localhost:5173`.

Important:
- Set `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `VITE_SUPABASE_URL`, and `VITE_SUPABASE_ANON_KEY` in your environment before `docker compose up`.
- The compose stack defaults `ENABLE_LOCAL_OBJECT_STORAGE_FALLBACK=false`, so production-style runs require S3-compatible storage credentials instead of local disk uploads.
