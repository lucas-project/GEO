# GEO user-flow acceptance and redesign plan

Date: 2026-09-14 (Australia/Sydney)

## Verdict

**Not ready for product acceptance.** Several individual functions work, but the journey from an existing report to appropriate improvements and verified results is inconsistent. The problems require shared state, evidence policy, and information architecture changes, not just different labels.

This was a browser exercise on **http://localhost:3000**, using Playwright with installed Google Chrome at 1440×1000 and 390×844. Actions included filling forms, submitting jobs, navigating between tools, opening report details, generating and dismissing artifacts, downloading a presence report, and reviewing narrow-screen layout. Screenshots and browser text are in [acceptance-2026-09-14](acceptance-2026-09-14/). Unit tests/build results are not used as proof of acceptance.

No product implementation was changed during this review. Browser tests created local audit/job/agent records, two optimization records, a presence report, and appended a crawl attempt to the existing MD Home audit. No external website was modified and no recurring monitoring schedule was added.

## Environment and interpretation

- Existing local database and application configuration were used. The UI reports that AI simulation/model-assisted features are disabled in free deterministic mode; a provider initialization log alone does not prove those features are available.
- The first server/browser session was sandboxed. External navigation to example.com, MD Home and Daikin returned `ERR_NETWORK_ACCESS_DENIED`. Those crawl failures are **not evidence that the websites are broken or blocking GEO**.
- The expected Playwright headless browser executable was absent. Both standard and core installer commands exited successfully without making that executable available. Installation exit status must not be accepted as a readiness check.
- The server was restarted with network permission. A separate Playwright Chrome control successfully loaded all three websites with HTTP 200 and their expected titles. example.com then completed a real crawl and automatically opened its report. Chrome fallback allowed progress despite the missing default browser package.
- First-pass Presence findings demonstrate behavior when acquisition is unavailable. They do not establish the real off-site visibility of Midea Australia.
- Actual external citations, paid provider performance, CMS publishing, and elapsed recurring-monitoring schedules were not validated. Nothing in this report should be read as acceptance of those capabilities.

## Tested paths and observed outcomes

| User task | Observation | Assessment | Evidence |
| --- | --- | --- | --- |
| Open Home and start an audit | White theme renders. Global target bar, agent prompt and separate audit CTA compete for attention. | Works; redesign needed | `00-home.png`, `01-audit.txt` |
| Audit example.com homepage | After network permission, browser automatically navigates to `/audit/cmu18htku0002acdk5njv8lye`. | Automatic result navigation works | `21-audit-network-result.txt` |
| Understand homepage scope | “Homepage only” produces “1/5 requested pages” and partial result, despite a one-page inventory. | Fail | `21-audit-network-result.txt` |
| Open existing MD Home report | Page status descriptions are English; filters and details open. | Basic interaction works | `06-mdhome-report.txt`, `07-page-detail.txt` |
| Continue from historical report | Sidebar Optimize, Simulate and Content say no audit exists, after MD Home report was viewed. Freshly completed example.com does unlock tools. | Fail: historical report handoff | `09-optimize-mdhome.txt`, `10-target-simulate.txt`, `10-target-content.txt`, `22-optimize-complete-audit.txt` |
| Discover MD Home pages | Sandboxed attempt returned only the seed with no adequate failure warning. Network-enabled run eventually returned real ranked pages but stayed on a generic discovery message for minutes. | Functional recovery; poor progress/failure semantics | `19-discovery-start.txt`, `28-discovery-network.txt` |
| Retry a failed page in a partial audit | Selection submitted HTTP 202, then “Extend failed / All selected pages were already audited”. A previous failed `/support` attempt is treated as ineligible. | Fail: retry blocked | `08-extend-start.txt`, `32-extend-terminal.txt` |
| Add a genuinely unread page | Network-enabled `/room-sizing-guide` extension completed in about 10.4 seconds; observed pages increased 7 → 8 and UI automatically refreshed and scrolled to summary. | Pass for addition and refresh; confirmation is below the new viewport | `34-extend-job.json`, `34-extend-result.txt`, `34-extend-view.png` |
| Generate FAQ markup | Returns empty content with `insufficient_evidence`; Mark applied and Recheck are disabled. Copy remains enabled; UI calls it “Just generated”. | Evidence guard works; presentation needs correction | `23-optimize-generated.txt` |
| Generate metadata and reject draft | Generated concrete HTML from the captured example.com content; “Do not apply” persisted `dismissed`. | Pass for draft generation and dismissal | `26-metadata-artifact.txt`, `27-dismiss-artifact.txt` |
| Generate content ideas for a placeholder | Rejects generic example content, but repeats the same explanation and retains “Queued…”. | Appropriate rejection; terminal UI fails | `24-content-generate.txt` |
| Open AI simulation | Shows unavailable message in free deterministic mode, but also promotes question generation first. | Capability explanation occurs too late | `25-simulate-after-audit.txt` |
| Run presence scan and export | Completes and exports JSON, but weak/search-entry evidence becomes “Verified”, “Profiles found” and a 9/100 verdict. | Fail: unsupported conclusions | `16-presence-result.txt`, `presence-export.json` |
| Compare MD Home with Daikin | Submission reached a crawl failure in the sandboxed pass; failed crawl explanation suggested CDN issues. | Error-state tested; successful comparison not accepted | `13-compare-start.txt` |
| Plan and execute Agent | Actual audit plan created; Run plan entered running state and ultimately showed `Execution completed` with a View link. | Pass for one audit-only plan; multi-tool plans not accepted | `18-agent-retry.txt`, `31-agent-run.txt`, `33-agent-terminal.txt` |
| Inspect monitoring | Existing sites, schedules, history/alerts displayed; alerts expose internal names and old next-run dates. | Read-only UI reviewed; scheduling not accepted | `nav-monitor.txt` |
| Read report on phone-sized viewport | Fixed sidebar consumes 256 px; report squeezed into a narrow column. Document width 400 vs viewport 390. | Fail: effectively unusable layout | `30-mobile-top.png`, `29-mobile-report.txt` |

## Findings with concrete reproduction and repair requirements

### P0-1: acquisition failure becomes a factual visibility assessment

Reproduce: run Presence when acquisition/search cannot retrieve reliable evidence. In the first pass, exported results list `limited_data` for Quora and regional platforms. The presented evidence includes generic search URLs and a constructed Quora topic URL. Nevertheless, the report says “Verified on Quora, Web search, Whirlpool, ProductReview.com.au, OzBargain” and “9/100 — Needs Work”. It also infers how often AI may cite the brand.

Required changes:

- Keep `discovered_link`, `search_entry`, `retrieved_page`, `matched_brand` and `verified_profile` distinct. A search URL is a place to look, not a discovered brand profile.
- Require an observed response, substantive matched content, capture time, source URL and identity match for a verified claim. Preserve missing/blocked/not-run outcomes end to end.
- Score only eligible evidence. Return an unrated/insufficient state when coverage is inadequate. Do not map unavailable acquisition to low visibility, zero news footprint or missing profiles.
- Generate recommendations from applicable observations, not a universal “get Reddit/Wikipedia/Google Business Profile” checklist. The manufacturer was described as a local service brand; show/edit inferred category before industry-sensitive recommendations.
- Show “Search this platform” for search destinations. Do not count them in “Where we found you” or verified-profile counts.
- Audit old serialized reports on read so fixing new scans does not leave old misleading verdicts visible.

Acceptance: with all external sources blocked, UI and JSON contain no verified-profile claim and no numeric visibility verdict. With a real observed matching profile, its excerpt and URL explain the claim. A retrieved page with no match is distinguishable from an unreachable page.

### P0-2: report readiness depends on browser history instead of available evidence

Reproduce in a fresh browser context: open Audit → expand Recent audits → MD Home report → sidebar Optimize/Simulate/Content. All three indicate that an audit is missing. After a new example.com audit completes in the same context, Optimize opens normally.

CodeGraph confirmed `useAuditReady` in `src/features/workspace/audit-first-gate.tsx` checks locally held `lastAuditId` and `lastAuditForUrl`. `OptimizeWorkspace` also initializes from URL parameters or that local shortcut. A database report and a local “last audit” shortcut are not equivalent.

Required changes:

- Resolve the selected site's usable report from a server-backed query; browser state may cache the selection, but must not determine whether the report exists.
- Introduce explicit site/report context in tool routes. Opening a report selects that report for relevant follow-up actions; historical reports remain selectable by date, site and status.
- Gate each action by usable evidence and capabilities, allowing partial reports where sufficient evidence exists. Explain exactly what is missing for an unavailable action.
- Replace manual audit-ID entry with a readable report selector. Preserve site, report, page and issue when a report recommendation opens Optimize.
- Avoid silently retaining another site's audit when the global URL changes.

Acceptance: fresh context, reload, direct report URL, sidebar navigation, www aliases and target switching all resolve the intended report without rerunning the audit or copying IDs. Invalid IDs show a clear recoverable error.

### P0-3: requested scope and displayed scores contradict each other

Reproduce: choose “Skip page picker — audit homepage only” for example.com. Result inventory is 1/1, banner reports 1/5, evidence coverage is 100%, header readiness is 94, and benchmark cards call 23 the site's “overall GEO score”. MD Home mixes 13% page sample and 30% evidence coverage, plus 2% citation signals without an experiment.

CodeGraph confirmed `startHomepageOnly` in `src/features/audit/audit-entry.tsx` sends only `{ url }`, without explicit `maxPages` or `pageUrls`.

Required changes:

- Send and persist explicit requested scope. Distinguish discovery count, requested count, attempted count, observed count and evidence-criterion coverage.
- Compute completion from the requested scope and stop reason, not a default page budget or discovered inventory size.
- Use one named primary metric with score version, sample and uncertainty. Historical heuristic scores must be labeled separately everywhere, including benchmarks and recent audits.
- Replace “Why AI can't reliably cite this site” with an evidence-scoped heading such as “What limits this assessment”. No citation experiment means “Not measured”, not a percentage suggesting observed citations.
- Apply page-purpose checks before recommending Product, FAQ, pricing, byline or media schema. A documentation placeholder must not receive a product-sales plan.

Acceptance: a successfully observed homepage-only request is 1/1 complete; all views use consistent score names/versions; 0% is never substituted for an unmeasured citation result; recommendations explain applicability and evidence.

### P0-4: failed pages cannot be retried through the offered action

Reproduce: open MD Home report, filter “Could not connect”, select a page with a prior failed acquisition and click “Audit selected pages (1)”. Job `713aadbc-a884-4229-897e-05f0d5d00feb` failed with “All selected pages were already audited”. The terminal error remained visible and Dismiss worked; the underlying retry did not.

CodeGraph confirmed `extendAudit` in `src/modules/geo-audit/service.ts:1055` loads every existing crawl row's URL into `auditedSet`, regardless of observation success, and excludes every matching URL. This rejects precisely the failed pages the UI offers to retry.

Required changes:

- Make “Add pages” and “Retry failed pages” explicit operations with a shared eligibility policy used by UI and API.
- Select the current observation per canonical URL, not merely the presence of any crawl row. Failed/blocked/timed-out observations are retryable; duplicate successful observations need an explicit recheck action.
- Preserve attempt history and choose current evidence deterministically. Replace or version corresponding extraction records so retries do not duplicate score contributions.
- Return observed/failed/skipped counts and a reason per skipped URL. Handle already-completed duplicate requests as an understandable no-op where appropriate.

Acceptance: fail a controlled page once, allow it on the next attempt, retry from the inventory, and observe exactly one current page contribution plus both attempt records. Mixed successful/failed selections report their actual outcomes without rejecting the entire useful request. Include this repair in Batch 1.

### P1-1: audit navigation is numbered, but the work is still fragmented

The report's five numbered sections improved order, yet recommendations, a long inventory, two pipeline visualizations, raw issues, target review, question generation, monitoring and benchmarks remain on one long surface. “View details” primarily reveals crawl internals, rather than answering which issue affects this page. The success message repeats per URL; failures repeat exclusion text. Failed acquisition can also show “Not audited”.

Required layout:

1. Persistent compact target/report header: target name, URL, report date, sample, status and one main next action.
2. **Overview**: what was checked, what is known, what is missing, and at most three actionable priorities.
3. **Pages**: searchable/paginated inventory with compact rows, filters, selected count and a sticky action bar. Separate “Read”, “Failed to read” and “Not attempted”. Page detail shows issues and evidence first; crawl diagnostics are secondary.
4. **Improvements**: issue → affected page → evidence → recommended action → draft → user disposition → recheck. Explain whether the action is available before navigation.
5. **Experiments**: citation tests and off-site checks, with capability and evidence requirements. Monitoring belongs to site-level settings/history.

Use English outcome labels: “Check target website”, “Review results”, “Improve a page”, “Verify changes”. Keep Agent under advanced tools instead of making a prompt composer the largest home interaction. Rename global “YOUR WEBSITE” to “TARGET WEBSITE”.

Acceptance: a first-time user can find the main limitation, affected page, evidence and next action without reading technical sections; primary page actions stay visible while scrolling; report summary remains useful at 55+ pages.

### P1-2: job states and capabilities are inconsistent

Observed: sidebar and main audit progress differed briefly (20% vs 18%); Presence repeated progress text and Cancel buttons; Content showed Queued alongside a rejection twice; discovery had a long generic spinner and no visible cancel; new reports were described as predating question generation. Missing browser dependencies and sandbox network failures were described as website/CDN problems.

Required changes:

- A shared job presentation contract: queued, running, partial, completed, failed, cancelled, interrupted. Include target, task, current phase, start time, last activity, result link and retry eligibility.
- Distinguish execution completion from evidence success. For example: “Finished: 0 of 1 pages read. Report updated with the failed attempt.”
- On completion, update the exact report query, move focus/scroll only if the user is still in that task, and show a visible top-level result notice. On another page, show a persistent result link instead of stealing navigation.
- Verified on the successful MD Home extension: automatic summary scrolling works, but the “Report updated” notice remains down in the page inventory. Put the confirmation at the destination, and include what changed (for example, “1 page added; 8 pages now included”).
- Separate app dependency/configuration failures from target network/WAF errors. Probe browser launch and outbound network health before expensive work; retain diagnostics behind “Technical details”.
- Capability-check before question generation, simulations and model-based work. Disabled mode needs one explanation and an appropriate alternative, not an enabled multi-step setup ending in rejection.
- Use explicit missing-data reasons (`not_generated`, `disabled`, `failed`, `legacy`) rather than inferring “old audit” from an empty array.

Acceptance: every submitted job has a persistent terminal outcome; navigate away/back and reload during work; one canonical progress source; no Queued label after failure; zero unobserved completion claims; disabled actions explain their requirement before submission.

### P1-3: responsive layout and reading hierarchy

The light theme is in place. However, mobile keeps the full desktop sidebar, leaving roughly 134 px for all content before padding. The saved 390 px screenshot shows a nearly word-by-word report column and clipped target controls.

Required changes: collapse navigation to a drawer below the desktop breakpoint, make content `min-width: 0`, wrap the target header intentionally, use a readable single column and keep actionable controls accessible. Review secondary-text contrast and spacing on the light background. Provide labels for repeated controls and live announcements for job results.

Acceptance: 390×844, 768×1024 and 1440×1000 screenshots; no document-level horizontal scroll; report and primary actions usable by keyboard; mobile navigation does not occupy permanent desktop width.

### P2: refinement and trust issues

- Optimize exposes raw audit IDs, evidence IDs and `insufficient_evidence`; turn these into report/page selectors and readable evidence links.
- Do not label an empty, blocked artifact as successfully generated or offer Copy for empty content. Keep the working application guard.
- Benchmark explanation for a metadata artifact discussed content chunks; bind supporting rationale to the chosen action and identify the cohort honestly.
- Monitoring shows `commercialReadiness` and `aiReadability`, and June next-run timestamps in September. Distinguish overdue, paused, scheduler unavailable and no recent run. Some historical “issue” descriptions include positive checks; reconcile alert semantics before presenting them as regressions.
- A generic “no keywords” response should distinguish extraction failure, unsupported mode and genuinely insufficient page content. Returned MD Home suggestions included navigation/service labels such as “Error Code List”; let users choose useful topic keywords from a short recommended set.

## Implementation in no more than five batches

Estimate: **14–21 focused engineering days**, including browser regression and design iteration, for one engineer familiar with the repository. This is a planning estimate, not a delivery promise. Provider/network remediation or new CMS integrations are outside this estimate.

| Batch | Effort | Deliverable | Exit gate |
| --- | --- | --- | --- |
| 1. Correct evidence and scope | 3–5 days | Acquisition preflight/error taxonomy; failed-page retry; explicit homepage scope; unified metric semantics; Presence evidence eligibility; page-purpose applicability | P0-1/P0-3/P0-4 counterexamples pass, including blocked sources and example.com |
| 2. Reliable site/report/task context | 3–4 days | Server-backed report resolution; historical report handoff; shared capability/job state; terminal outcomes and query refresh | Fresh browser can continue from historical/partial report; all task states recover across navigation |
| 3. Main journey and report redesign | 3–4 days | Target-first home, Overview/Pages/Improvements/Experiments, compact inventory, sticky selection actions, readable evidence drawer | Usability walkthrough: explain result and reach a relevant action without ID copying or long-page hunting |
| 4. Tool completion and responsive design | 3–4 days | Context-aware drafts and rechecks, simulation/presence gating, monitoring freshness, mobile drawer/layout | Draft/dismiss/recheck flow plus capability-off and mobile paths pass; no empty-artifact success |
| 5. Repeatable acceptance and release gate | 2–4 days | Playwright journeys, seeded failure fixtures, real external smoke checks, screenshots, updated findings | All must-pass criteria below satisfied; external/unsupported features explicitly reported |

Keep routes thin and domain logic in existing modules. Use React Query plus workspace context; no new state-management or services layer. Playwright code stays under `src/modules/crawling/browser/`. Validate migrations separately when data contracts change. Build into a separate output directory from the running dev server.

## Final acceptance gate

- Fresh browser: select a target, run homepage or chosen-page scope, receive correct progress and automatically reach the correct result.
- Three sources with different characteristics: a simple page, a real multi-page manufacturer site, and a controlled blocked/timeout fixture. Distinguish product defects from the external environment.
- Existing report: open from history, continue through relevant tools, refresh, switch sites and return without losing or mixing context.
- Partial audit: retry one failed page and add one new page; report revision, counts, metrics and terminal notice reflect exactly what changed. Preserve previous evidence appropriately.
- Evidence: no retrieval means unknown; search entry is not a verified profile; no citation experiment means not measured; inspect both UI and exports.
- Recommendation: applicable to the page and supported by evidence. Missing FAQ answers does not produce fabricated markup. Metadata draft has a usable preview and source references.
- Optimize: draft → reject or user-recorded application → same-scope recheck → change verification. Use a controlled editable fixture to test actual improvement; do not claim deploying to third-party websites.
- Async: success, partial, failure, cancellation, interruption and capability-disabled cases all have one clear outcome and next action.
- Responsive: desktop/tablet/mobile and keyboard review; primary actions remain discoverable.
- Monitoring: verify schedule execution under controlled time/worker conditions before claiming monitoring acceptance. No need to modify an existing customer's schedule during read-only review.
- Complete typecheck, lint, relevant domain tests and isolated build after implementation, followed by the actual browser flow. Passing code checks alone does not satisfy this gate.

Meeting these gates can establish correctness and usability of the tested product workflows. It cannot guarantee that external AI systems will cite a target website; that outcome requires actual experiments and sufficient evidence.
