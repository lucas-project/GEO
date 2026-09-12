/**
 * Browser pool — manages shared Playwright browser instance(s).
 *
 * ALL Playwright page rendering lives under this directory.
 * Audit/hub crawls use playwright-extra + stealth Chromium.
 * Off-site presence uses CloakBrowser by default (stealth Chromium); Firefox/Chromium via env.
 */

import type { Browser, BrowserContext, Page } from 'playwright';
import { config } from '@shared/config';
import {
  launchBrowser,
  launchEphemeralBrowser,
  launchEphemeralOffSiteBrowser,
  launchOffSiteBrowser,
  offSiteStorageStatePath,
  shutdownBrowsers,
} from './launcher';

export { shutdownBrowsers as shutdownBrowser };

export type RenderProfile = 'audit' | 'audit-secondary' | 'hub' | 'discovery' | 'off-site';

export interface RenderRequest {
  url: string;
  timeoutMs?: number;
  waitForSelector?: string;
  scrollToBottom?: boolean;
  screenshot?: boolean;
  profile?: RenderProfile;
  headless?: boolean;
  /** When false, load images/fonts (Reddit). Default true for non-Reddit off-site URLs. */
  blockHeavyResources?: boolean;
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
  performance: { lcpMs: number | null; mobileBodyTextLength: number | null };
  sessionReused?: boolean;
}

const WEBDRIVER_INIT_SCRIPT = () => {
  Object.defineProperty(navigator, 'webdriver', {
    get: () => undefined,
  });
};

function stealthEnabledForProfile(profile: RenderProfile): boolean {
  return profile !== 'discovery' && profile !== 'off-site';
}

function isRedditHost(url: string): boolean {
  try {
    return /(^|\.)reddit\.com$/i.test(new URL(url).hostname.replace(/^www\./, ''));
  } catch {
    return /reddit\.com/i.test(url);
  }
}

function shouldBlockHeavyResources(req: RenderRequest, profile: RenderProfile): boolean {
  if (profile === 'discovery') return true;
  if (profile !== 'off-site') return false;
  if (req.blockHeavyResources === false) return false;
  if (isRedditHost(req.url)) return false;
  return true;
}

async function applyWebdriverPatch(page: Page): Promise<void> {
  await page.addInitScript(WEBDRIVER_INIT_SCRIPT);
}

export async function renderPage(req: RenderRequest): Promise<RenderResult> {
  const profile = req.profile ?? 'audit';
  const headless = req.headless ?? config.crawl.headless;
  const ephemeral = headless === false;
  const isOffSite = profile === 'off-site';
  const measurePerformance = profile === 'audit';
  const scroll =
    req.scrollToBottom ??
    (profile === 'audit' || profile === 'audit-secondary' || profile === 'hub');
  const networkIdleMs =
    profile === 'discovery'
      ? 0
      : profile === 'off-site'
        ? 3000
        : profile === 'audit-secondary'
          ? 3500
          : profile === 'hub'
            ? 4000
            : profile === 'audit'
              ? 6000
              : 8000;
  const scrollCapMs =
    profile === 'audit-secondary' ? 3000 : profile === 'hub' ? 2500 : profile === 'off-site' ? 0 : 4000;

  const stealth = stealthEnabledForProfile(profile);
  const browser = ephemeral
    ? isOffSite
      ? await launchEphemeralOffSiteBrowser()
      : await launchEphemeralBrowser()
    : isOffSite
      ? await launchOffSiteBrowser(headless)
      : await launchBrowser(stealth);

  const storageState = isOffSite ? offSiteStorageStatePath() : undefined;
  const sessionReused = Boolean(storageState);

  const context: BrowserContext = await browser.newContext(
    ephemeral
      ? {
          viewport: { width: 1280, height: 800 },
          locale: 'en-US',
          timezoneId: 'America/New_York',
          ...(storageState ? { storageState } : {}),
        }
      : {
          userAgent: config.crawl.browserUserAgent,
          viewport: { width: 1280, height: 800 },
          locale: 'en-US',
          timezoneId: 'America/New_York',
          ...(storageState ? { storageState } : {}),
          extraHTTPHeaders: isOffSite
            ? {
                'Accept-Language': 'en-US,en;q=0.9',
                Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
              }
            : {
                'Accept-Language': 'en-US,en;q=0.9',
                Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Sec-Fetch-Dest': 'document',
                'Sec-Fetch-Mode': 'navigate',
                'Sec-Fetch-Site': 'none',
                'Sec-Fetch-User': '?1',
                'Upgrade-Insecure-Requests': '1',
              },
        },
  );
  const page: Page = await context.newPage();
  const skipWebdriverPatch = isOffSite && config.presenceProbe.browser === 'cloak';
  if (!skipWebdriverPatch) {
    await applyWebdriverPatch(page);
  }
  const t0 = Date.now();

  if (shouldBlockHeavyResources(req, profile)) {
    await page.route('**/*', (route) => {
      const type = route.request().resourceType();
      if (type === 'image' || type === 'media' || type === 'font') {
        void route.abort();
      } else {
        void route.continue();
      }
    });
  }

  try {
    const response = await page.goto(req.url, {
      timeout: req.timeoutMs ?? config.crawl.timeoutMs,
      waitUntil: profile === 'discovery' ? 'commit' : 'domcontentloaded',
    });
    const initialHtml = await page.content();
    const initialMeasure = await measureDom(page);

    if (networkIdleMs > 0) {
      await page.waitForLoadState('networkidle', { timeout: networkIdleMs }).catch(() => {});
    }
    if (req.waitForSelector) {
      await page.waitForSelector(req.waitForSelector, { timeout: 5000 }).catch(() => {});
    }

    if (scroll) {
      await autoScroll(page, scrollCapMs);
    }

    const renderedHtml = await page.content();
    const finalMeasure = await measureDom(page);
    const title = await page.title().catch(() => null);
    const screenshotBytes = req.screenshot
      ? await page.screenshot({ fullPage: false, type: 'png' }).catch(() => null)
      : null;

    let lcpMs: number | null = null;
    let mobileBodyTextLength: number | null = null;
    if (measurePerformance) {
      lcpMs = await page
        .evaluate(() => {
          const entries = performance.getEntriesByType('largest-contentful-paint');
          const last = entries[entries.length - 1] as { startTime?: number } | undefined;
          return last?.startTime ?? null;
        })
        .catch(() => null);

      await page.setViewportSize({ width: 390, height: 844 });
      mobileBodyTextLength = await page
        .evaluate(() => (document.body?.innerText ?? '').replace(/\s+/g, ' ').trim().length)
        .catch(() => null);
    }

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
      performance: {
        lcpMs: lcpMs != null && Number.isFinite(lcpMs) ? Math.round(lcpMs) : null,
        mobileBodyTextLength:
          mobileBodyTextLength != null && Number.isFinite(mobileBodyTextLength)
            ? mobileBodyTextLength
            : null,
      },
      sessionReused,
    };
  } finally {
    await context.close().catch(() => {});
    if (ephemeral) {
      await browser.close().catch(() => {});
    }
  }
}

async function autoScroll(page: Page, maxMs = 4000): Promise<void> {
  await page
    .evaluate(async (capMs) => {
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
        setTimeout(() => {
          clearInterval(timer);
          resolve();
        }, capMs);
      });
    }, maxMs)
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
