/**
 * Browser pool — manages a single shared Playwright browser instance.
 *
 * ALL Playwright code lives under this directory. No other module in the
 * codebase imports `playwright` directly (enforced by review + lint).
 * Reason: blueprint Section 6 — "Browser Automation Isolation".
 */

import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { config } from '@shared/config';
import { crawlLogger } from '@shared/logger';

let browserPromise: Promise<Browser> | null = null;

async function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = chromium.launch({
      headless: config.crawl.headless,
      args: ['--disable-blink-features=AutomationControlled'],
    });
    crawlLogger.info('launching Chromium');
  }
  return browserPromise;
}

export async function shutdownBrowser(): Promise<void> {
  if (!browserPromise) return;
  try {
    const b = await browserPromise;
    await b.close();
    crawlLogger.info('Chromium shut down');
  } catch (err) {
    crawlLogger.warn({ err: (err as Error).message }, 'browser shutdown failed');
  } finally {
    browserPromise = null;
  }
}

export interface RenderRequest {
  url: string;
  timeoutMs?: number;
  waitForSelector?: string;
  scrollToBottom?: boolean;
  screenshot?: boolean;
}

export interface RenderResult {
  finalUrl: string;
  statusCode: number;
  html: string;
  renderedHtml: string;
  title: string | null;
  screenshotBytes: Buffer | null;
  durationMs: number;
  hydrationDelta: { addedTextChars: number; addedNodes: number };
}

export async function renderPage(req: RenderRequest): Promise<RenderResult> {
  const browser = await getBrowser();
  const context: BrowserContext = await browser.newContext({
    userAgent: config.crawl.userAgent,
    viewport: { width: 1280, height: 800 },
    locale: 'en-US',
  });
  const page: Page = await context.newPage();
  const t0 = Date.now();

  try {
    const response = await page.goto(req.url, {
      timeout: req.timeoutMs ?? config.crawl.timeoutMs,
      waitUntil: 'domcontentloaded',
    });
    const initialHtml = await page.content();
    const initialMeasure = await measureDom(page);

    await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
    if (req.waitForSelector) {
      await page.waitForSelector(req.waitForSelector, { timeout: 5000 }).catch(() => {});
    }

    if (req.scrollToBottom ?? true) {
      await autoScroll(page);
    }

    const renderedHtml = await page.content();
    const finalMeasure = await measureDom(page);
    const title = await page.title().catch(() => null);
    const screenshotBytes = req.screenshot
      ? await page.screenshot({ fullPage: false, type: 'png' }).catch(() => null)
      : null;

    return {
      finalUrl: page.url(),
      statusCode: response?.status() ?? 0,
      html: initialHtml,
      renderedHtml,
      title,
      screenshotBytes: screenshotBytes ? Buffer.from(screenshotBytes) : null,
      durationMs: Date.now() - t0,
      hydrationDelta: {
        addedTextChars: Math.max(0, finalMeasure.textChars - initialMeasure.textChars),
        addedNodes: Math.max(0, finalMeasure.nodeCount - initialMeasure.nodeCount),
      },
    };
  } finally {
    await context.close().catch(() => {});
  }
}

async function autoScroll(page: Page): Promise<void> {
  await page
    .evaluate(async () => {
      await new Promise<void>((resolve) => {
        let total = 0;
        const distance = 600;
        const timer = setInterval(() => {
          window.scrollBy(0, distance);
          total += distance;
          if (total >= document.body.scrollHeight - window.innerHeight) {
            clearInterval(timer);
            resolve();
          }
        }, 120);
        // Hard cap so very tall pages don't hang us.
        setTimeout(() => {
          clearInterval(timer);
          resolve();
        }, 4000);
      });
    })
    .catch(() => {});
}

async function measureDom(page: Page): Promise<{ textChars: number; nodeCount: number }> {
  return page
    .evaluate(() => {
      return {
        textChars: document.body?.innerText?.length ?? 0,
        nodeCount: document.querySelectorAll('*').length,
      };
    })
    .catch(() => ({ textChars: 0, nodeCount: 0 }));
}
