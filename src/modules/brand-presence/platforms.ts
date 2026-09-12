import type { PresencePlatform } from './schemas';

export interface PlatformMatch {
  platform: PresencePlatform;
  url: string;
}

function hostMatches(host: string, domain: string): boolean {
  return host === domain || host.endsWith(`.${domain}`);
}

const MATCHERS: Array<{ platform: PresencePlatform; test: (host: string, path: string) => boolean }> = [
  {
    platform: 'reddit',
    test: (host) =>
      hostMatches(host, 'reddit.com') || host === 'redd.it' || host.endsWith('.redd.it'),
  },
  {
    platform: 'quora',
    test: (host) => hostMatches(host, 'quora.com'),
  },
  {
    platform: 'g2',
    test: (host) => hostMatches(host, 'g2.com'),
  },
  {
    platform: 'capterra',
    test: (host) => hostMatches(host, 'capterra.com'),
  },
  {
    platform: 'trustpilot',
    test: (host, path) =>
      hostMatches(host, 'trustpilot.com') && (path === '/' || /\/review\//i.test(path)),
  },
  {
    platform: 'linkedin',
    test: (host, path) =>
      hostMatches(host, 'linkedin.com') &&
      path.length > 1 &&
      !/^\/(login|signup|auth|legal|pulse)\b/i.test(path),
  },
  {
    platform: 'x',
    test: (host) => hostMatches(host, 'x.com') || hostMatches(host, 'twitter.com'),
  },
  {
    platform: 'youtube',
    test: (host, path) =>
      hostMatches(host, 'youtube.com') &&
      (path === '/' ||
        /\/(@|channel\/|c\/|user\/|watch)/i.test(path) ||
        path.length <= 1),
  },
  {
    platform: 'facebook',
    test: (host, path) =>
      hostMatches(host, 'facebook.com') && !/^\/(login|reg|help)\b/i.test(path),
  },
  {
    platform: 'instagram',
    test: (host, path) =>
      hostMatches(host, 'instagram.com') && !/^\/(accounts|explore)\b/i.test(path),
  },
  {
    platform: 'github',
    test: (host, path) =>
      hostMatches(host, 'github.com') &&
      /\/[^/]+\/?$/.test(path) &&
      !/^\/(login|signup|features|pricing)\b/i.test(path),
  },
  {
    platform: 'xiaohongshu',
    test: (host, path) =>
      hostMatches(host, 'xiaohongshu.com') &&
      !/^\/explore\/?$/i.test(path) &&
      path.length > 1,
  },
  {
    platform: 'zhihu',
    test: (host, path) =>
      hostMatches(host, 'zhihu.com') && /\/question\/|\/answer\/|\/p\//i.test(path),
  },
  {
    platform: 'tiktok',
    test: (host, path) =>
      hostMatches(host, 'tiktok.com') &&
      (/\/video\/\d+/i.test(path) || /@/i.test(path)),
  },
  {
    platform: 'amazon',
    test: (host, path) =>
      /\.amazon\./i.test(host) &&
      (/\/dp\/[A-Z0-9]{8,}/i.test(path) ||
        /\/product-reviews\//i.test(path) ||
        /\/review\//i.test(path)),
  },
  {
    platform: 'whirlpool',
    test: (host) => hostMatches(host, 'forums.whirlpool.net.au') || hostMatches(host, 'whirlpool.net.au'),
  },
  {
    platform: 'productreview',
    test: (host) => hostMatches(host, 'productreview.com.au'),
  },
  {
    platform: 'ozbargain',
    test: (host) => hostMatches(host, 'ozbargain.com.au'),
  },
];

export function matchPlatformUrl(href: string): PlatformMatch | null {
  let parsed: URL;
  try {
    parsed = new URL(href);
  } catch {
    return null;
  }
  const host = parsed.hostname.replace(/^www\./, '');
  const path = parsed.pathname;

  for (const { platform, test } of MATCHERS) {
    if (test(host, path)) {
      return { platform, url: parsed.toString() };
    }
  }
  return null;
}

export function isPricingPath(pathname: string): boolean {
  return /\/pricing(\/|$)/i.test(pathname) || /\/plans(\/|$)/i.test(pathname);
}

export function isComparePath(pathname: string): boolean {
  return /\/compare(\/|$)/i.test(pathname) || /\/vs(\/|$)/i.test(pathname);
}

export function isContactPath(pathname: string): boolean {
  return /\/contact(\/|$)/i.test(pathname) || /\/about(\/|$)/i.test(pathname);
}
