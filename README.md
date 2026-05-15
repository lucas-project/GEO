# GEO AI Operating System

> AI Search Infrastructure for the Generative Engine Optimization (GEO) era.
> Build websites that ChatGPT, Gemini, Claude, and Perplexity can understand, summarize, and cite.

A full-stack, **API-first**, **modular-monolith** implementation of the platform described in [`geo_ai_operating_system_product_design_blueprint.md`](./geo_ai_operating_system_product_design_blueprint.md).

All 5 phases scaffolded. Phases 1 and 2 fully functional; Phases 3–5 functional with skeleton depth.

---

## What's inside

### Layer 4 — Client Interfaces

| Client | Path | Status |
| --- | --- | --- |
| Web app (Next.js dashboard) | `src/app/` | ✅ Full |
| CLI (`geo-audit`, `geo …`) | `clients/cli/` | ✅ Full |
| Chrome Extension (MV3 side panel) | `clients/chrome-extension/` | ✅ Functional |
| WordPress Plugin | `clients/wordpress-plugin/` | ✅ Skeleton (FAQ injection live) |

### Layer 3 — API

```
POST  /api/geo-audit              Run an audit (async, returns jobId)
GET   /api/geo-audit              List recent audits
GET   /api/geo-audit/[id]         Fetch a complete audit report
GET   /api/geo-audit/[id]/similar-chunks?q=…  Top chunks by embedding similarity
POST  /api/crawl                  Enqueue standalone crawl (returns jobId)
POST  /api/simulate-ai-search     Run a multi-platform AI simulation (async)
GET   /api/simulate-ai-search     List / fetch simulations
POST  /api/citation-test          Sync: extract citations from a text blob
POST  /api/competitor-analysis    Compare target vs competitors (async)
GET   /api/competitor-analysis    List recent comparisons
POST  /api/auto-fix               Generate artifact; optional `applyWordpressDraft` for FAQ → WP draft
GET   /api/auto-fix?auditId=...   List generated artifacts
GET   /api/report?auditId=&runId=&format=json|html  Export bundled report
GET   /api/monitor                List monitored sites + recent alerts
POST  /api/monitor                Add a site to monitoring
DELETE /api/monitor?siteId=...    Remove a site
POST  /api/monitor/run            Run monitoring (one site or full sweep)
POST  /api/agent/plan             Convert a goal into a typed plan
GET   /api/agent/plan/[id]        Fetch plan + step results
POST  /api/agent/run              Execute a persisted plan
GET   /api/jobs/[id]              Poll any async job
```

### Layer 2 — Orchestration

`src/shared/queue/` exposes a `Queue` interface used by every long-running operation. The default `in-memory` adapter persists jobs to SQLite so the Next.js server and the worker process share the same job table. Set `QUEUE_DRIVER=bullmq` + `REDIS_URL` to use the **BullMQ** adapter ([`src/shared/queue/adapters/bullmq.ts`](./src/shared/queue/adapters/bullmq.ts)); run **`npm run worker`** in a second terminal so jobs are consumed (see [`docs/orchestration.md`](./docs/orchestration.md)). **Temporal** is the documented production target — its semantics are a superset of this interface.

### Layer 1 — GEO Core Modules

Each module is a strict vertical slice under `src/modules/`:

| Module | What it does |
| --- | --- |
| `crawling` | Playwright headless Chromium, sitemap + robots, full-page render with hydration delta |
| `extraction` | Metadata, headings, JSON-LD schema, FAQs, **LLM-extracted entities (Zod-validated)**, semantic chunks, comparison tables, author signals |
| `geo-audit` | **10-dimension** weighted scoring + LLM narrative + issue/fix derivation |
| `ai-simulation` | Multi-persona AI search simulation (ChatGPT/Gemini/Claude/Perplexity), regex + LLM citation extraction |
| `competitor-analysis` | Diff target vs up to 5 competitors across dimensions, entities, schema |
| `optimization` | Live generators: FAQ JSON-LD, llms.txt, AI summary, answer-first rewrite, Product/Org schema, metadata patches |
| `monitoring` | Scheduled re-audit, diff against baseline, alert producer |
| `geo-agent` | Planner (LLM → Zod-typed PlanSteps) + executor (threads outputs forward) |
| `embeddings` | Chunk embedding index + similarity search (per audit) |

### Shared Infrastructure (zero business logic)

`src/shared/`:
- `ai/` — **provider abstraction** (`mock` ⟂ `openai` ⟂ `anthropic` ⟂ `gemini`) with a `MultiProvider` for simulating different AI search platforms.
- `database/` — Prisma singleton.
- `queue/` — typed queue interface + adapters.
- `cache/`, `logger/`, `telemetry/`, `config/`.

---

## Setup

Requires **Node.js 22+** and **npm 10+**. Tested on Windows + macOS + Linux.

```bash
git clone <this-repo>
cd GEO

# 1. Install deps
npm install

# 2. Generate Prisma client + create local SQLite DB
npx prisma generate
npx prisma db push

# 3. Install the Playwright browser (one-time, ~150 MB)
npx playwright install chromium

# 4. Copy env template
copy .env.example .env       # (Windows)
cp .env.example .env         # (macOS / Linux)
```

The defaults in `.env` are zero-config — no API keys required.

### Run

In one terminal:

```bash
npm run dev          # Next.js on http://localhost:3000
```

In a second terminal (optional, recommended for long jobs):

```bash
npm run worker       # background worker
```

> The default `in-memory` queue runs handlers inside both the Next.js server **and** the worker. In dev you can get away without the worker; with `QUEUE_DRIVER=bullmq` the worker is required.

Open <http://localhost:3000> and try one of the suggested prompts on the landing page.

### Optional: CLI

```bash
cd clients/cli
npm install
npm link

geo-audit https://example.com
geo simulate "best VRF air conditioning Australia" --brand=Daikin
geo agent "Improve my AI visibility for example.com"
```

### Optional: Chrome Extension

Load `clients/chrome-extension/` as an **unpacked extension** in `chrome://extensions/` with Developer mode enabled.

### Optional: WordPress Plugin

Copy `clients/wordpress-plugin/` to `wp-content/plugins/geo-ai-os/` and activate.

---

## Configuration

All knobs are in [`.env.example`](.env.example). The most-asked-about ones:

| Variable | Default | Purpose |
| --- | --- | --- |
| `AI_PROVIDER` | `mock` (default) | `mock`, `openai`, `anthropic`, `gemini`, **`ollama`** |
| `GEO_API_SECRET` | empty | When set, protects all `/api/*` routes (Bearer or `x-geo-api-key`) |
| `DATABASE_URL` | `file:./prisma/dev.db` | SQLite for dev; swap to Postgres URL for prod |
| `QUEUE_DRIVER` | `memory` | `memory` (in-process), `bullmq` (needs `REDIS_URL`) |
| `OPENAI_API_KEY` etc. | empty | only required if `AI_PROVIDER` is set to that provider |
| `CRAWL_MAX_PAGES` | `20` | Cap pages per crawl |
| `CRAWL_HEADLESS` | `true` | Set to `false` to watch Playwright crawls live |

### Bring Your Own AI

```bash
# .env
AI_PROVIDER=openai
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini       # optional override
```

The platform falls back to the mock provider with a logged warning if the key is missing, so no part of the app breaks when you forget to set a key.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  CLIENTS                                                        │
│  Web (Next.js) · CLI · Chrome Ext · WordPress Plugin            │
└─────────────────────────────────────────────────────────────────┘
                      │  HTTP (REST)
                      ▼
┌─────────────────────────────────────────────────────────────────┐
│  API LAYER                                                      │
│  /api/{geo-audit, simulate-ai-search, competitor-analysis,      │
│        auto-fix, monitor, agent, jobs}                          │
└─────────────────────────────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────────┐
│  ORCHESTRATION                                                  │
│  Queue (memory | bullmq | Temporal-ready)                       │
└─────────────────────────────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────────┐
│  GEO CORE MODULES (modular monolith)                            │
│  crawling · extraction · geo-audit · ai-simulation ·            │
│  competitor-analysis · optimization · monitoring · geo-agent    │
└─────────────────────────────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────────┐
│  SHARED INFRASTRUCTURE                                          │
│  ai (provider abstraction) · database (Prisma) · queue · cache  │
│  logger · telemetry · config                                    │
└─────────────────────────────────────────────────────────────────┘
```

### Strict module boundaries (blueprint Section 6)

- A module is only consumed through its `index.ts` — never through deep imports.
- All Playwright code lives inside `src/modules/crawling/browser/`. No other module imports `playwright`.
- All LLM calls go through `src/shared/ai/`. No other module imports `openai` / `@anthropic-ai/sdk` / `@google/generative-ai`.
- Each module owns its own prompts under `src/modules/<name>/prompts/`.
- All AI outputs are validated by Zod schemas.

This makes provider swaps and module rewrites mechanical, not architectural.

---

## Production migration notes

| From (dev) | To (production) | Effort |
| --- | --- | --- |
| SQLite | PostgreSQL | Change `DATABASE_URL`; rerun `prisma migrate`. Schema is Postgres-compatible. |
| In-memory queue | BullMQ | Set `QUEUE_DRIVER=bullmq` + `REDIS_URL`, run `npm run worker`. See [`docs/orchestration.md`](./docs/orchestration.md). |
| Mock / cloud AI | **Ollama** (local) | Set `AI_PROVIDER=ollama`; run [Ollama](https://ollama.com) and `ollama pull llama3.2` + `ollama pull nomic-embed-text`. Hugging Face GGUF models can be pulled via `ollama pull hf.co/...` when published on the Hub. |
| BullMQ | Temporal | Replace the adapter file. The `Queue` interface in `src/shared/queue/types.ts` is a direct subset of Temporal's `WorkflowClient` semantics. |
| Mock AI provider | OpenAI / Anthropic / Gemini / **Ollama** | Set `AI_PROVIDER` and keys (or run Ollama locally; no cloud key). |
| Static screenshots | S3 / R2 / CDN | Replace `saveScreenshot()` in `src/modules/crawling/service.ts`. |
| Single-user dev | Multi-tenant | Wire `src/modules/auth/` (currently `ownerId=local` everywhere) and pass through API routes. |

---

## What's intentionally deferred

These are explicitly noted in the blueprint as "Strategic Warnings — avoid feature explosion." They're reachable from current interfaces without refactoring the core:

- Live CMS patching (WordPress beyond FAQ injection; Shopify; headless CMSes).
- Email/Slack/webhook alert sinks (current: in-app inbox only).
- Stripe billing (current: tier model in code, no payment integration).
- Multi-user / org auth (current: single `local` owner).
- Vector store / GEO Knowledge Graph (embedding API exists; no persistent vector DB yet).

---

## Project layout

```
GEO/
├── prisma/
│   └── schema.prisma                  # All 10 tables (Jobs, Sites, GeoAudits, etc.)
├── src/
│   ├── app/                           # Next.js App Router (UI + API routes)
│   ├── modules/                       # 8 vertical-slice modules
│   ├── shared/                        # 7 shared infrastructure folders
│   ├── components/                    # Design system (UI + GEO-specific)
│   ├── features/                      # Frontend feature folders (per page)
│   ├── lib/                           # Tiny utils (cn, api-client, ...)
│   └── providers/                     # React Query, theme
├── workers/
│   └── index.ts                       # Worker entry (npm run worker)
├── clients/
│   ├── cli/                           # Standalone npm CLI
│   ├── chrome-extension/              # MV3 side panel
│   └── wordpress-plugin/              # PHP plugin
├── public/screenshots/                # Audit screenshots (gitignored)
├── geo_ai_operating_system_product_design_blueprint.md
├── .env.example
└── README.md
```

---

## Available scripts

```bash
npm run dev               # Next.js dev server
npm run worker            # Standalone worker process
npm run build             # Production build
npm run start             # Run production server (after build)
npm run lint              # ESLint
npm run typecheck         # tsc --noEmit (no emit, strict)
npm run prisma:generate   # Regenerate Prisma client
npm run prisma:push       # Sync schema to DB (dev)
npm run prisma:migrate    # Create + apply a named migration (prod-flow)
npm run playwright:install
npm run setup             # One-shot: install → prisma → playwright
```

---

## License

MIT — but per blueprint Section 9, the **GEO intelligence layer** (scoring weights, simulation prompts, optimization heuristics) is intended to remain proprietary in any production deployment. Open source the SDK / CLI / extension; keep the moat private.
