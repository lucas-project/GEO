/**
 * Browser launchers — Chromium (audit/hub + stealth), CloakBrowser (off-site default),
 * and Firefox/Chromium fallbacks for off-site presence.
 */

import { existsSync } from 'node:fs';
import { chromium as playwrightChromium, firefox as playwrightFirefox, type Browser } from 'playwright';
import { config } from '@shared/config';
import { crawlLogger } from '@shared/logger';

let stealthPluginRegistered = false;
let plainBrowserPromise: Promise<Browser> | null = null;
let stealthBrowserPromise: Promise<Browser> | null = null;
let offSiteFirefoxPromise: Promise<Browser> | null = null;
let offSiteChromiumPromise: Promise<Browser> | null = null;
let offSiteCloakPromise: Promise<Browser> | null = null;

const LAUNCH_ARGS = [
  '--disable-blink-features=AutomationControlled',
  '--disable-dev-shm-usage',
  '--no-sandbox',
];

function bundledChromiumOptions(headless: boolean) {
  return {
    headless,
    args: LAUNCH_ARGS,
  };
}

async function ensureStealthChromium(): Promise<typeof playwrightChromium> {
  const { chromium: chromiumExtra } = await import(
    /* webpackIgnore: true */ 'playwright-extra'
  );
  if (!stealthPluginRegistered) {
    const StealthPlugin = (await import(
      /* webpackIgnore: true */ 'puppeteer-extra-plugin-stealth'
    )).default;
    chromiumExtra.use(StealthPlugin());
    stealthPluginRegistered = true;
  }
  return chromiumExtra;
}

export interface LaunchCloakOptions {
  headless: boolean;
  humanize?: boolean;
}

/** CloakBrowser stealth Chromium — drop-in Playwright Browser. */
export async function launchCloakBrowser(options: LaunchCloakOptions): Promise<Browser> {
  const { launch } = await import(/* webpackIgnore: true */ 'cloakbrowser');
  const humanize = options.humanize ?? config.presenceProbe.cloakHumanize;
  const proxy = config.presenceProbe.cloakProxy;

  crawlLogger.info(
    { headless: options.headless, humanize, hasProxy: Boolean(proxy) },
    'launching CloakBrowser for off-site presence probes',
  );

  return launch({
    headless: options.headless,
    humanize,
    proxy,
    timezone: 'America/New_York',
    locale: 'en-US',
  });
}

/** Shared headless browser (pooled) — audit/hub Chromium. */
export async function launchBrowser(stealth: boolean): Promise<Browser> {
  const headless = config.crawl.headless;
  if (stealth && config.crawl.useStealth) {
    if (!stealthBrowserPromise) {
      crawlLogger.info('launching Chromium (playwright-extra stealth, headless)');
      stealthBrowserPromise = ensureStealthChromium().then((chromium) =>
        chromium.launch(bundledChromiumOptions(headless)),
      );
    }
    return stealthBrowserPromise;
  }

  if (!plainBrowserPromise) {
    crawlLogger.info({ headless }, 'launching bundled Chromium');
    plainBrowserPromise = playwrightChromium.launch(bundledChromiumOptions(headless));
  }
  return plainBrowserPromise;
}

/** Pooled off-site browser (CloakBrowser by default). */
export async function launchOffSiteBrowser(headless: boolean): Promise<Browser> {
  const engine = config.presenceProbe.browser;

  if (engine === 'cloak') {
    if (!offSiteCloakPromise) {
      offSiteCloakPromise = launchCloakBrowser({ headless });
    }
    return offSiteCloakPromise;
  }

  if (engine === 'chromium') {
    if (!offSiteChromiumPromise) {
      crawlLogger.info('launching Chromium for off-site presence probes');
      offSiteChromiumPromise = playwrightChromium.launch(bundledChromiumOptions(headless));
    }
    return offSiteChromiumPromise;
  }

  if (!offSiteFirefoxPromise) {
    crawlLogger.info({ headless }, 'launching Firefox for off-site presence probes');
    offSiteFirefoxPromise = playwrightFirefox.launch({ headless });
  }
  return offSiteFirefoxPromise;
}

/**
 * One-off headed browser for off-site WAF retry.
 */
export async function launchEphemeralOffSiteBrowser(): Promise<Browser> {
  const engine = config.presenceProbe.browser;

  if (engine === 'cloak') {
    crawlLogger.info('launching headed CloakBrowser for off-site WAF retry');
    return launchCloakBrowser({ headless: false, humanize: true });
  }

  if (engine === 'chromium') {
    return launchEphemeralBrowser();
  }

  crawlLogger.info('launching headed Firefox for off-site WAF retry');
  return playwrightFirefox.launch({ headless: false });
}

/**
 * One-off headed system Chrome for audit/hub WAF retry — not pooled.
 */
export async function launchEphemeralBrowser(): Promise<Browser> {
  const channel = config.crawl.wafRetryChromeChannel;
  const systemOpts = {
    channel,
    headless: false,
    args: LAUNCH_ARGS,
  } as const;

  try {
    crawlLogger.info({ channel }, 'launching system Chrome for WAF retry');
    return await playwrightChromium.launch(systemOpts);
  } catch (err) {
    crawlLogger.warn(
      { err: (err as Error).message, channel },
      'system Chrome unavailable — falling back to headed bundled Chromium',
    );
    return playwrightChromium.launch(bundledChromiumOptions(false));
  }
}

export function offSiteStorageStatePath(): string | undefined {
  const path = config.presenceProbe.storageStatePath;
  if (!path || !existsSync(path)) return undefined;
  return path;
}

export async function shutdownBrowsers(): Promise<void> {
  const close = async (promise: Promise<Browser> | null) => {
    if (!promise) return;
    try {
      const b = await promise;
      await b.close();
    } catch (err) {
      crawlLogger.warn({ err: (err as Error).message }, 'browser shutdown failed');
    }
  };

  await close(plainBrowserPromise);
  await close(stealthBrowserPromise);
  await close(offSiteFirefoxPromise);
  await close(offSiteChromiumPromise);
  await close(offSiteCloakPromise);
  plainBrowserPromise = null;
  stealthBrowserPromise = null;
  offSiteFirefoxPromise = null;
  offSiteChromiumPromise = null;
  offSiteCloakPromise = null;
  crawlLogger.info('browsers shut down');
}
