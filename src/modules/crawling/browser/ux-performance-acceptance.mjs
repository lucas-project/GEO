import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';

const base = 'http://localhost:3000';
const historicalId = 'cmtzu16ys0006acuk38s99e21';
const output = process.env.UX_PERF_OUTPUT ?? 'docs/acceptance-2026-09-14/fixes/performance-results.json';
const routes = process.env.UX_PERF_ROUTES?.split(',') ?? ['/', `/audit/${historicalId}`, '/optimize', '/geo-content', '/simulate'];
const runsPerRoute = Number(process.env.UX_PERF_RUNS ?? 3);

await mkdir('docs/acceptance-2026-09-14/fixes', { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const results = [];

for (const route of routes) {
  for (let run = 1; run <= runsPerRoute; run += 1) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const page = await context.newPage();
    await page.addInitScript(() => {
      window.__uxPerf = { lcp: 0, cls: 0 };
      new PerformanceObserver(list => {
        const entries = list.getEntries();
        window.__uxPerf.lcp = entries.at(-1)?.startTime ?? window.__uxPerf.lcp;
      }).observe({ type: 'largest-contentful-paint', buffered: true });
      new PerformanceObserver(list => {
        for (const entry of list.getEntries()) {
          if (!entry.hadRecentInput) window.__uxPerf.cls += entry.value;
        }
      }).observe({ type: 'layout-shift', buffered: true });
    });
    const started = performance.now();
    const response = await page.goto(`${base}${route}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(500);
    const wallMs = Math.round(performance.now() - started);
    const metrics = await page.evaluate(() => {
      const nav = performance.getEntriesByType('navigation')[0];
      const resources = performance.getEntriesByType('resource');
      return {
        ttfbMs: Math.round(nav.responseStart),
        domContentLoadedMs: Math.round(nav.domContentLoadedEventEnd),
        loadMs: Math.round(nav.loadEventEnd),
        lcpMs: Math.round(window.__uxPerf.lcp),
        cls: Number(window.__uxPerf.cls.toFixed(4)),
        transferKb: Math.round(resources.reduce((sum, entry) => sum + (entry.transferSize || 0), 0) / 1024),
        resourceCount: resources.length,
        slowestResources: resources
          .map(entry => ({ name: new URL(entry.name).pathname, durationMs: Math.round(entry.duration) }))
          .sort((a, b) => b.durationMs - a.durationMs)
          .slice(0, 5),
      };
    });
    results.push({ route, run, status: response?.status(), wallMs, ...metrics });
    await context.close();
  }
}

const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
await page.goto(`${base}/audit/${historicalId}`, { waitUntil: 'networkidle' });
const interactionStarted = performance.now();
await page.getByRole('link', { name: 'Optimize', exact: true }).click();
await page.getByRole('combobox', { name: 'Audit report' }).waitFor();
const reportToOptimizeMs = Math.round(performance.now() - interactionStarted);
await context.close();

const summary = routes.map(route => {
  const samples = results.filter(result => result.route === route);
  const median = key => samples.map(sample => sample[key]).sort((a, b) => a - b)[Math.floor(samples.length / 2)];
  return {
    route,
    medianWallMs: median('wallMs'),
    medianTtfbMs: median('ttfbMs'),
    medianDomContentLoadedMs: median('domContentLoadedMs'),
    medianLoadMs: median('loadMs'),
    medianLcpMs: median('lcpMs'),
    medianCls: median('cls'),
    medianTransferKb: median('transferKb'),
    medianResourceCount: median('resourceCount'),
  };
});

const report = {
  environment: 'Next.js production server; local database; free-deterministic mode; mock AI; system Chrome; 1440x1000',
  runsPerRoute,
  summary,
  reportToOptimizeMs,
  samples: results,
};
await writeFile(output, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
await browser.close();
