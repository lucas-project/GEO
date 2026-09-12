import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import type { Browser } from 'playwright';
import { config } from '@shared/config';

const cloakLaunch = vi.fn();
const firefoxLaunch = vi.fn();

vi.mock('cloakbrowser', () => ({
  launch: (...args: unknown[]) => cloakLaunch(...args),
}));

vi.mock('playwright', async (importOriginal) => {
  const actual = await importOriginal<typeof import('playwright')>();
  return {
    ...actual,
    firefox: {
      ...actual.firefox,
      launch: (...args: unknown[]) => firefoxLaunch(...args),
    },
  };
});

type PresenceBrowser = typeof config.presenceProbe.browser;

describe('off-site browser launcher', () => {
  let savedBrowser: PresenceBrowser;

  beforeEach(async () => {
    savedBrowser = config.presenceProbe.browser;
    cloakLaunch.mockReset();
    firefoxLaunch.mockReset();
    cloakLaunch.mockResolvedValue({ close: vi.fn() } as unknown as Browser);
    firefoxLaunch.mockResolvedValue({ close: vi.fn() } as unknown as Browser);
    const { shutdownBrowsers } = await import('./launcher');
    await shutdownBrowsers();
  });

  afterEach(async () => {
    (config.presenceProbe as { browser: PresenceBrowser }).browser = savedBrowser;
    const { shutdownBrowsers } = await import('./launcher');
    await shutdownBrowsers();
  });

  it('uses CloakBrowser when presenceProbe.browser is cloak', async () => {
    (config.presenceProbe as { browser: PresenceBrowser }).browser = 'cloak';
    const { launchOffSiteBrowser } = await import('./launcher');
    await launchOffSiteBrowser(true);
    expect(cloakLaunch).toHaveBeenCalledWith(
      expect.objectContaining({
        headless: true,
        humanize: true,
        timezone: 'America/New_York',
        locale: 'en-US',
      }),
    );
  });

  it('uses Firefox when presenceProbe.browser is firefox', async () => {
    (config.presenceProbe as { browser: PresenceBrowser }).browser = 'firefox';
    const { launchOffSiteBrowser } = await import('./launcher');
    await launchOffSiteBrowser(true);
    expect(firefoxLaunch).toHaveBeenCalled();
    expect(cloakLaunch).not.toHaveBeenCalled();
  });

  it('launches headed CloakBrowser with humanize for ephemeral WAF retry', async () => {
    (config.presenceProbe as { browser: PresenceBrowser }).browser = 'cloak';
    const { launchEphemeralOffSiteBrowser } = await import('./launcher');
    await launchEphemeralOffSiteBrowser();
    expect(cloakLaunch).toHaveBeenCalledWith(
      expect.objectContaining({
        headless: false,
        humanize: true,
      }),
    );
  });
});
