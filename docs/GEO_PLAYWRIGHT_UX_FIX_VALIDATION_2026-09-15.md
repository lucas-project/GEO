# GEO Playwright UX fix validation

Date: 2026-09-15 (Australia/Sydney)

## Result

The defects reproduced in `GEO_PLAYWRIGHT_UX_ACCEPTANCE_2026-09-14.md` were repaired and rechecked on `http://localhost:3000` with installed Google Chrome. Evidence is stored in `acceptance-2026-09-14/fixes/`.

## Verified repairs

| Finding | Result | Evidence |
| --- | --- | --- |
| Homepage-only scope | Pass. The submitted payload contains the normalized `example.com` URL, `maxPages: 1`, and one explicit page URL. The completed report stores 1 requested and 1 audited page with `completed` status. | `fixes/results.json`, `fixes/homepage-completed.png` |
| Historical report handoff | Pass. Opening MD Home report `cmtzu16ys0006acuk38s99e21` selects that exact report. Optimize preserves it across reload; Content and Simulate no longer show the missing-audit gate. | `fixes/results.json`, `fixes/historical-optimize-reload.png`, `fixes/historical-geo-content.txt`, `fixes/historical-simulate.txt` |
| Failed-page retry | Pass. Retrying `/support` preserved the original failed row, added one successful attempt, selected that attempt as current evidence, increased included pages from 8 to 9, and produced one inventory contribution. Repeating the successful URL completed as a no-op with one explained skip and no extra crawl row. | `fixes/retry-results.json`, `fixes/retry-completed.png` |
| Presence evidence safety | Pass in domain tests using the original misleading `presence-export.json`. Legacy and new reports are unrated when coverage is insufficient; search entries cannot verify profiles; JSON export contains null visibility dimensions and no numeric verdict. A verified profile requires an observed 2xx response, capture time, substantive excerpt, source URL, and identity match. | `src/modules/off-site-presence/evidence-policy.test.ts` |
| Citation presentation | Pass. Reports without a citation experiment display `Not measured`; recent-audit copy no longer converts the historical heuristic into a factual cite percentage. | `fixes/retry-completed.png` |
| Empty artifact state | Pass. An evidence-blocked FAQ result displays `More evidence needed`, with Copy and application controls unavailable for empty content. | `fixes/results.json`, `fixes/empty-faq-guard.png` |
| Responsive report | Pass at 390x844, 768x1024, and 1440x1000. Document width equals viewport width at each size. Mobile uses a navigation drawer; report tabs, URLs, page rows, and status badges wrap without document-level horizontal scrolling. | `fixes/results.json`, `fixes/report-390.png`, `fixes/pages-390.png`, `fixes/report-768.png`, `fixes/report-1440.png` |
| Terminal jobs and capability gating | Pass in regression checks. Completed/failed/cancelled labels take precedence over query loading state. Simulation question generation is hidden behind the provider capability result, and discovery can be cancelled. | `src/components/geo/job-progress.test.ts` |
| Page-purpose applicability | Pass in regression checks. A documentation-only sample does not recommend FAQ or Product schema. | `src/modules/geo-audit/improvement-plan.test.ts` |
| Browser dependency errors | Implemented. Audit Chromium falls back to installed Chrome when the bundled executable is absent; missing browser and server network denial use application/environment messages and do not blame the target site. | `src/modules/crawling/browser/launcher.ts`, `src/modules/crawling/acquisition.ts` |

## Automated checks

- TypeScript: pass (`npm.cmd run typecheck`)
- ESLint: pass with zero warnings (`npm.cmd run lint`)
- Vitest: 115 files and 357 tests pass (`npm.cmd test -- --reporter=dot`)
- Production build: pass (`npm.cmd run build`)
- Playwright acceptance: pass (`node src/modules/crawling/browser/ux-acceptance.mjs`)
- Failed-page retry acceptance: pass (`node src/modules/crawling/browser/ux-retry-acceptance.mjs`)

## Production performance rerun

Playwright measured three cold browser contexts per route against `next start` at 1440x1000. The acceptance specification does not define numeric performance budgets, so these results are reported against standard user-facing browser milestones rather than presented as compliance with an unpublished target.

| Route | Median LCP | Median CLS | Median load | Median settled time |
| --- | ---: | ---: | ---: | ---: |
| Home | 372 ms | 0.0845 | 487 ms | 1,585 ms |
| Audit report | 1,556 ms | 0.0308 | 494 ms | 2,958 ms |
| Optimize | 384 ms | 0.0299 | 475 ms | 1,685 ms |
| Content | 412 ms | 0.0299 | 498 ms | 1,565 ms |
| Simulate | 536 ms | 0.0299 | 481 ms | 1,561 ms |

The first diagnostic found that audit pages started `/api/site-keywords` globally, adding 13.6 seconds of unrelated crawling and extending median settled time to 15.74 seconds. Keyword detection is now deferred to Presence and Simulate, where it is consumed. The audit report settled in 2.96 seconds after the change. Report-to-Optimize interaction readiness was 889 ms. Full samples and slow-resource diagnostics are in `fixes/performance-results.json` and `fixes/performance-report-diagnostic.json`.

The main functional suite passed in 10.55 seconds. The real failed-page retry passed in 33.03 seconds for `https://www.mdhome.com.au/product/athena-series`; that duration includes external target and network latency and is not a local page-render metric.

## Acceptance boundary

These checks establish the repaired local workflow and evidence semantics. They do not establish real visibility or citation frequency on external AI systems, successful publishing to a third-party CMS, or elapsed recurring monitoring. Those outcomes still require their own configured integrations and controlled acceptance runs.
