# GEO AI OS — contributor guide

## Where code lives

| Layer | Path | Use for |
| --- | --- | --- |
| Routes | `src/app/` | Next.js pages and `app/api/**/route.ts` handlers only |
| UI features | `src/features/<name>/` | Product screens and workflows |
| Shared UI | `src/components/ui/`, `src/components/geo/` | Reusable primitives and GEO widgets |
| Domain logic | `src/modules/<name>/` | Business rules, prompts, queue handlers |
| Infrastructure | `src/shared/` | AI, database, queue, config, logger (no product logic) |
| Small helpers | `src/lib/` | API client, URL utils, route helpers |

Do **not** add Redux/Zustand or a separate `services/` layer. React Query + one workspace context is enough.

## Module boundaries

- Import modules only through `@modules/<name>` (their `index.ts`).
- LLM calls only via `@shared/ai`.
- Playwright only under `src/modules/crawling/browser/`. Off-site presence probes default to **CloakBrowser** (`PRESENCE_PROBE_BROWSER=cloak`); run `npm run cloak:install` once to cache the stealth Chromium binary.
- Env only via `@shared/config`.

## Adding an async feature (checklist)

1. **Module** — `src/modules/<name>/` with `service.ts`, `handlers.ts`, `schemas.ts`, and `index.ts`.
2. **Queue** — register handler in [`src/shared/queue/register-handlers.ts`](src/shared/queue/register-handlers.ts).
3. **API** — thin `POST` in `src/app/api/.../route.ts` using [`src/lib/api-route.ts`](src/lib/api-route.ts) (`parseJsonBody`, `parseZod`, `enqueueJob`).
4. **UI** — feature component using [`src/hooks/use-async-job.ts`](src/hooks/use-async-job.ts) and optional [`src/components/geo/job-progress.tsx`](src/components/geo/job-progress.tsx).
5. **Poll** — clients poll `GET /api/jobs/[id]`; job types live in `@shared/queue/types`.

## Quality commands

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

With BullMQ: run `npm run worker` in a second terminal.
