# GEO commercial readiness acceptance

Date: 2026-09-15 (Australia/Sydney)

## Verdict

The current product is **not ready for an unqualified commercial GEO offering**. Its deterministic on-page audit can be offered as an advisory beta if the product clearly labels heuristic scores and unavailable external evidence. Citation visibility, off-site visibility, end-to-end optimization generation, and recurring monitoring are not yet proven commercial capabilities.

## What was exercised

- Three recent identical one-page `example.com` audits were compared.
- Two fresh live crawls of the same MD Home scope were run: homepage, FAQ page, and Athena product page.
- Criteria-to-evidence references, scoring signatures, output artifacts, failure handling, and idempotent submission were checked.
- The full automated suite, production build, lint, typecheck, and a clean 12-migration SQLite deployment were run.
- The configured simulation capability was queried directly.

Raw live-run evidence is in `acceptance-2026-09-14/fixes/commercial-reliability-results.json`.

## Reliable behavior observed

| Capability | Result |
| --- | --- |
| Simple-page repeatability | Pass. Three identical `example.com` homepage audits produced the same content hash, overall score, 12 dimension scores, readiness criteria, and evidence count. |
| Evidence references | Pass. Both live MD Home reports had 30 checked criteria and no missing or unresolved evidence IDs. |
| Idempotent job submission | Pass. Two concurrent requests with the same idempotency key returned the same job ID. |
| Unreachable target handling | Pass. An invalid DNS target ended as a failed job and did not create a zero-score audit report. |
| Unsupported artifact safety | Pass for safety. Both FAQ generation attempts returned empty content with an explicit insufficient-evidence rationale rather than invented FAQ answers. |
| Database readiness | Pass. A new SQLite database accepted all 12 migrations. |
| Regression suite | Pass. 115 files and 357 tests passed; typecheck, zero-warning lint, and production build passed. |

## Commercial blockers

### P0: unsupported numeric conclusions

Reports still expose numeric citation probability and off-site presence scores when no citation experiment or external presence verification exists. The fresh MD Home reports had no `presenceProbe`, yet both returned off-site presence `45`. They had zero simulation runs, yet citation probability remained a number. `example.com` simultaneously returned overall score `23`, readiness `94`, citation probability `0`, and off-site presence `18` without external verification. These values are internally generated heuristics, but the API shape allows customers to read them as measured outcomes.

Required gate: unavailable outcomes must be `null`/unrated in the API, exports, historical records, and every aggregate that consumes them. A score may become numeric only from evidence that satisfies the published measurement contract.

### P0: contradictory completion status

Both MD Home runs retrieved all three requested pages and reported coverage `1`, but the report status was `partial`. `stopReason=httpRequests` came from discovery/network budgeting even though the explicit requested scope completed 3/3. A customer cannot distinguish a complete contracted sample from an incomplete discovery attempt.

Required gate: completion must be derived from the requested scope. Discovery-budget exhaustion should be separate metadata and should affect only claims about wider site coverage.

### P0: no live AI visibility validation

The configured simulation provider is `mock`; ChatGPT, Gemini, Claude, and Perplexity modes are all mock and capability availability is `mode_disabled`. No repeated live-provider citation runs, cross-provider agreement checks, or current-response evidence were produced.

Required gate: run a versioned prompt set repeatedly against each supported live provider, store raw responses and citations, quantify run-to-run variance, and abstain when provider evidence is unavailable.

### P0: scoring accuracy is not calibrated against labeled truth

The repository has deterministic rule tests but no completed labeled evaluation showing precision/recall for fact detection, entity attribution, competitor relevance, off-site identity matching, or recommendation correctness. Existing product audit targets call for at least 95% precision on key deterministic checks and off-site confirmations and at least 90% Precision@3 for competitors; no current result demonstrates those thresholds.

Required gate: freeze a representative labeled dataset across industries and page archetypes, publish per-rule precision/recall and sample sizes, and version score changes against it.

### P0: representative optimization generation is incomplete

Both live runs successfully retrieved the site's dedicated FAQ page, but FAQ generation returned zero-length content with “Insufficient evidence.” This is safe behavior, but the promised audit-to-action loop does not complete on the representative site.

Required gate: extract visible accordion/JavaScript FAQ content or explain precisely why the page has no usable question-answer pairs, then prove generated schema matches visible source text.

## Stability findings

The two identical MD Home runs produced the same readiness score (`97`), the same 18 readiness outcomes, the same repair list, and valid evidence references. The final score was `49` versus `48`; AI readability changed `65` to `59`, semantic clarity `78` to `76`, and chunk optimization `40` to `38`. Two of three page content hashes changed between runs, consistent with dynamic rendered markup affecting extraction.

Required gate: define an allowed variance budget, hash normalized evidence rather than volatile page chrome, and fail release validation when unchanged source meaning causes score or recommendation drift above the budget.

## Remaining unverified areas

- Live off-site search/profile identity accuracy and blocked-source behavior at scale.
- Competitor Precision@3 on labeled businesses and industries.
- Real provider citation repeatability and cost/error behavior.
- Monitoring across actual scheduler intervals, restart recovery, and alert correctness.
- CMS publishing and post-publish same-scope recheck.
- Multi-user isolation, sustained queue load, backup/restore drills, and operational SLOs.

## Release boundary

An advisory beta can expose observed page facts, evidence-linked readiness criteria, crawl diagnostics, and source-bounded recommendations. Do not sell the current overall score, citation probability, off-site visibility, competitor conclusions, or simulated platform visibility as measured business outcomes until the P0 gates above pass.
