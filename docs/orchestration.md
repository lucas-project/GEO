# Orchestration (queue and workers)

## In-memory driver (default)

Workers claim pending rows with a short lease token and renew it on progress updates. Completion and failure use compare-and-set writes, so duplicate consumers and late cancellations cannot overwrite the current job state. Apply the job lease migration before starting a worker against an existing database (`npx prisma migrate deploy`).

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

The current Prisma schema and raw SQL paths target SQLite. Moving to PostgreSQL is a separate migration project: update the provider, make migrations and raw queries portable, migrate data, and rehearse rollback. Do not treat changing `DATABASE_URL` as a production database migration.

## SQLite maintenance and recovery

SQLite is suitable for the initial single-instance deployment, provided the web app and worker are stopped before backup or restore. Run `npm run db:backup` to copy the database into `GEO_DB_BACKUP_DIR` (default `./data/backups`); the command also copies matching WAL sidecars when present. Immediately run `npm run db:verify-backup -- <backup.db>` to check SQLite integrity and required GEO tables without changing the backup. Verification uses Node's built-in SQLite API and requires Node 22.5 or later. At least weekly, test a restore by copying the database and matching `-wal`/`-shm` files into a stopped local instance, then start it and load a known audit.

Run `npm run maintenance:prune` periodically to preview old screenshots and terminal jobs. It changes nothing until invoked as `npm run maintenance:prune -- --apply`. Retention defaults are 30 days for screenshots and 14 days for completed, failed, and cancelled jobs. Audit records, evidence, and embeddings are never deleted by this command.

## Continuous monitoring (production runbook)

Monitoring re-audits are **async jobs** — never run Playwright inside a serverless cron handler directly.

1. Set `QUEUE_DRIVER=bullmq`, `REDIS_URL`, and run **`npm run worker`** in a dedicated process.
2. Schedule daily sweeps using **one** of:
   - **Vercel / host cron** → `POST /api/cron/monitor` with header `Authorization: Bearer $CRON_SECRET`
   - **BullMQ repeat** → `MONITOR_SWEEP_CRON` (default `0 6 * * *`) when the worker starts
   - **Dev inline** → `MONITOR_SCHEDULER_MS=3600000` with the in-memory queue
3. Each sweep processes only sites where `nextRunAt <= now` and no active monitor lock is held.
4. On failure, `nextRunAt` advances with exponential backoff (`MONITOR_FAILURE_BACKOFF_HOURS`, cap `MONITOR_MAX_BACKOFF_HOURS`).

Required env vars: `CRON_SECRET`, `REDIS_URL`, `MONITOR_INTERVAL_HOURS` (optional), `MONITOR_LOCK_TIMEOUT_MINUTES`.

Schedule presets per site: `12h`, `daily`, `weekly`, or `adaptive` (shortens after regressions, lengthens when stable). Failed crawls set `monitorHealthCheck` and use lighter re-crawls (`MONITOR_HEALTH_CHECK_MAX_PAGES`) until success. Each cycle diffs citation visibility, schema/entity/structure signals, readability, crawl errors, and competitor gaps vs the previous baseline.

## GEO Intelligence (production notes)

- Rollups ingest **synchronously** at the end of each audit (fast path). Each rollup stores a `signals` JSON bundle (hierarchy, entities, tables, readability) plus legacy columns for compatibility.
- AI simulation runs write **citation snapshots** per site (`ingestCitationSnapshot`) for cohort citation patterns.
- Cohort **embeddings** enqueue via `intelligence.ingest` (async). Indexed when `overallScore >= INTELLIGENCE_EMBED_SCORE_THRESHOLD` **or** `targetVisibilityScore >= INTELLIGENCE_CITATION_EMBED_THRESHOLD`.
- Backfill historical audits: `npx tsx scripts/backfill-intelligence.ts` or `POST /api/intelligence/backfill` (re-extracts signals, citations, optional embeddings).
- Rebuild comparative lift stats: `POST /api/intelligence/reindex` or queue job `intelligence.reindex-cohorts`.
- APIs: `GET /api/intelligence/benchmarks?siteId=`, `insights?cohortKey=`, `graph?siteId=`.
- Benchmarks require `INTELLIGENCE_MIN_COHORT_SAMPLES` (default 20) before showing lift-style insights in the UI.
