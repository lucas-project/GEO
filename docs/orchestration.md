# Orchestration (queue and workers)

## In-memory driver (default)

`QUEUE_DRIVER=memory` uses [`../src/shared/queue/adapters/in-memory.ts`](../src/shared/queue/adapters/in-memory.ts). Jobs are stored in SQLite (`Job` table) and processed by an in-process poller. Next.js `instrumentation.ts` calls `queue.start()` so `npm run dev` processes jobs without a separate worker.

## BullMQ + Redis

1. Set `QUEUE_DRIVER=bullmq` and `REDIS_URL` (see [`.env.example`](../.env.example)).
2. Run Redis locally or in your cluster.
3. Run the web app (`npm run dev` or `npm start`) — it **enqueues** only; it does not start a BullMQ consumer unless `GEO_QUEUE_CONSUMER=true`.
4. Run **`npm run worker`** in a separate process. The npm script sets `GEO_QUEUE_CONSUMER=true` via `cross-env` and calls `queue.start()` so BullMQ workers drain the queue and update Prisma job rows for `GET /api/jobs/:id`.

The adapter lives in [`../src/shared/queue/adapters/bullmq.ts`](../src/shared/queue/adapters/bullmq.ts). Prisma remains the source of truth for job status and results.

## Temporal (production target)

The [`Queue`](../src/shared/queue/types.ts) interface is intentionally small so a Temporal-backed implementation can replace BullMQ without changing module handlers.

## Postgres and pgvector

For production, point `DATABASE_URL` at PostgreSQL and run `npx prisma migrate deploy`. Chunk vectors are stored as JSON arrays today; you can add a `vector` column and HNSW index via raw SQL migrations when you adopt `pgvector`.
