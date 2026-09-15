import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const base = 'http://localhost:3000';
const output = 'docs/acceptance-2026-09-14/fixes';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
const errors = [];
const results = [];
page.on('pageerror', error => errors.push(error.message));
async function snapshot(name) {
  await page.screenshot({ path: `${output}/${name}.png`, fullPage: false });
  await writeFile(`${output}/${name}.txt`, await page.locator('body').innerText());
}
try {
  const response = await context.request.get(`${base}/api/geo-audit?limit=100`);
  assert.equal(response.status(), 200);
  const { audits } = await response.json();
  const historical = audits.find(a => a.id === 'cmtzu16ys0006acuk38s99e21');
  assert.ok(historical, 'Historical MD Home report is required');
  await page.goto(`${base}/audit/${historical.id}`);
  await page.getByRole('heading', { name: 'Overview', exact: true }).waitFor();
  await snapshot('historical-overview');
  for (const [width, height] of [[390,844], [768,1024], [1440,1000]]) {
    await page.setViewportSize({ width, height });
    const dimensions = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth }));
    assert.ok(dimensions.document <= width, `Horizontal scroll at ${width}: ${JSON.stringify(dimensions)}`);
    await snapshot(`report-${width}`);
    await page.getByRole('link', { name: 'Pages', exact: true }).click();
    await snapshot(`pages-${width}`);
    await page.getByRole('link', { name: 'Overview', exact: true }).click();
    results.push({ test: `responsive-${width}`, passed: true, dimensions });
  }
  await page.getByRole('link', { name: 'Optimize', exact: true }).click();
  await page.getByRole('combobox', { name: 'Audit report' }).waitFor();
  assert.equal(await page.getByRole('combobox', { name: 'Audit report' }).inputValue(), historical.id);
  await page.reload();
  await page.getByRole('combobox', { name: 'Audit report' }).waitFor();
  assert.equal(await page.getByRole('combobox', { name: 'Audit report' }).inputValue(), historical.id);
  await snapshot('historical-optimize-reload');
  results.push({ test: 'historical-report-handoff-and-reload', passed: true, auditId: historical.id });
  for (const [label, route] of [['Content', 'geo-content'], ['Simulate', 'simulate']]) {
    await page.getByRole('link', { name: label, exact: true }).click();
    await page.waitForURL(`**/${route}`);
    await page.waitForFunction(() => !document.body.innerText.includes('Start with a site audit'));
    await snapshot(`historical-${route}`);
    results.push({ test: `historical-${route}`, passed: true });
  }
  await page.goto(`${base}/audit?url=https%3A%2F%2Fexample.com`);
  await page.getByRole('button', { name: /audit homepage only/i }).waitFor();
  const submitted = page.waitForRequest(r => r.url().endsWith('/api/geo-audit') && r.method() === 'POST');
  await page.getByRole('button', { name: /audit homepage only/i }).click();
  const payload = (await submitted).postDataJSON();
  assert.equal(new URL(payload.url).hostname, 'example.com');
  assert.equal(payload.maxPages, 1);
  assert.equal(payload.pageUrls.length, 1);
  await page.waitForURL(/\/audit\/[a-z0-9]+$/, { timeout: 180000 });
  await page.getByRole('heading', { name: 'Overview', exact: true }).waitFor();
  const auditId = new URL(page.url()).pathname.split('/').at(-1);
  const { audit } = await (await context.request.get(`${base}/api/geo-audit/${auditId}`)).json();
  assert.equal(audit.scoringMeta.requestedPages, 1);
  assert.equal(audit.scoringMeta.auditedPages, 1);
  assert.equal(audit.status, 'completed');
  assert.equal(new URL(audit.url).hostname, 'example.com');
  assert.ok((await page.locator('body').innerText()).includes('Not measured'));
  await snapshot('homepage-completed');
  results.push({ test: 'homepage-one-of-one', passed: true, auditId });
  await page.getByRole('link', { name: 'Optimize', exact: true }).click();
  await page.getByRole('button', { name: 'Generate FAQPage JSON-LD', exact: true }).click();
  await page.getByText('More evidence needed', { exact: true }).first().waitFor();
  const copyButtons = page.getByRole('button', { name: 'Copy', exact: true });
  assert.ok(await copyButtons.first().isDisabled());
  await snapshot('empty-faq-guard');
  results.push({ test: 'empty-faq-guard', passed: true });
  assert.deepEqual(errors, [], 'Browser runtime errors');
} catch (error) {
  results.push({ test: 'failure', message: error.message, url: page.url(), errors });
  await snapshot('failure').catch(() => {});
  process.exitCode = 1;
} finally {
  await writeFile(`${output}/results.json`, JSON.stringify({ results, errors }, null, 2));
  console.log(JSON.stringify({ results, errors }, null, 2));
  await browser.close();
}
