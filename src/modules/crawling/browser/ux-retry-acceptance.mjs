import { chromium } from 'playwright';
import { PrismaClient } from '@prisma/client';
import { writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const db = new PrismaClient();
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
const base = 'http://localhost:3000';
const results = [];
try {
  const historical = { id: 'cmtzu16ys0006acuk38s99e21' };
  const { audit: before } = await (await context.request.get(`${base}/api/geo-audit/${historical.id}`)).json();
  const target = before.pageInventory.pages.find(p => p.url.endsWith('/support') && p.observationStatus !== 'observed') ?? before.pageInventory.pages.find(p => p.observationStatus === 'unreachable');
  assert.ok(target, 'A failed MD Home page is required');
  const beforeRows = await db.crawlResult.findMany({ where: { auditId: historical.id, url: target.url } });
  assert.ok(beforeRows.length > 0);
  await page.goto(`${base}/audit/${historical.id}#coverage`);
  const checkbox = page.getByRole('checkbox', { name: `Select ${target.url}`, exact: true });
  await checkbox.check();
  const queued = page.waitForResponse(r => r.url().endsWith(`/api/geo-audit/${historical.id}/extend`) && r.request().method() === 'POST');
  await page.getByRole('button', { name: 'Retry / add selected pages (1)', exact: true }).click();
  const response = await queued;
  assert.equal(response.status(), 202);
  const { jobId } = await response.json();
  await page.getByText(/Report updated: 1 pages read; 0 failed; 0 skipped./).first().waitFor({ timeout: 180000 });
  const { job } = await (await context.request.get(`${base}/api/jobs/${jobId}`)).json();
  assert.equal(job.status, 'completed');
  assert.equal(job.result.extension.observed, 1);
  const afterRows = await db.crawlResult.findMany({ where: { auditId: historical.id, url: target.url }, orderBy: [{ fetchedAt: 'asc' }, { id: 'asc' }] });
  assert.equal(afterRows.length, beforeRows.length + 1);
  assert.equal(afterRows.at(-1).fetchStatus, 'observed');
  assert.equal(afterRows[0].fetchStatus, beforeRows[0].fetchStatus, 'Old attempt was modified');
  const { audit: after } = await (await context.request.get(`${base}/api/geo-audit/${historical.id}`)).json();
  assert.equal(after.pageInventory.pages.filter(p => p.url === target.url).length, 1);
  assert.equal(after.pageInventory.auditedCount, before.pageInventory.auditedCount + 1);
  await page.screenshot({ path: 'docs/acceptance-2026-09-14/fixes/retry-completed.png' });
  results.push({ test: 'failed-page-retry', passed: true, auditId: historical.id, url: target.url, beforeAttempts: beforeRows.length, afterAttempts: afterRows.length, beforeIncluded: before.pageInventory.auditedCount, afterIncluded: after.pageInventory.auditedCount, extension: job.result.extension });
  const duplicate = await context.request.post(`${base}/api/geo-audit/${historical.id}/extend`, { data: { pageUrls: [target.url] } });
  const duplicateJobId = (await duplicate.json()).jobId;
  let duplicateJob;
  for (let i = 0; i < 60; i++) {
    duplicateJob = (await (await context.request.get(`${base}/api/jobs/${duplicateJobId}`)).json()).job;
    if (['completed', 'failed', 'cancelled'].includes(duplicateJob.status)) break;
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  assert.equal(duplicateJob.status, 'completed');
  assert.equal(duplicateJob.result.extension.skipped.length, 1);
  assert.equal(await db.crawlResult.count({ where: { auditId: historical.id, url: target.url } }), afterRows.length);
  results.push({ test: 'successful-page-duplicate-no-op', passed: true });
} catch (error) {
  results.push({ test: 'failure', message: error.message, url: page.url() });
  await page.screenshot({ path: 'docs/acceptance-2026-09-14/fixes/retry-failure.png' });
  process.exitCode = 1;
} finally {
  console.log(JSON.stringify(results, null, 2));
  await writeFile('docs/acceptance-2026-09-14/fixes/retry-results.json', JSON.stringify(results, null, 2));
  await browser.close();
  await db.$disconnect();
}
