import { config } from '@shared/config';
import { canonicalPageUrl, normalizeWebsiteUrl, sameTargetSite } from '@/lib/website-url';

const LLMS_PATHS = ['/llms.txt', '/llms-full.txt', '/.well-known/llms.txt'];

/** Fetch llms.txt variants and extract markdown link targets. */
export async function collectLlmsUrls(siteUrl: string): Promise<string[]> {
  const root = normalizeWebsiteUrl(siteUrl);
  const found: string[] = [];

  const batches = await Promise.all(
    LLMS_PATHS.map(async (path) => {
      const url = new URL(path, root).toString();
      try {
        const res = await fetch(url, {
          headers: { 'user-agent': config.crawl.userAgent },
          signal: AbortSignal.timeout(8_000),
        });
        if (!res.ok) return [] as string[];
        const text = await res.text();
        return parseLlmsLinks(text, root);
      } catch {
        return [] as string[];
      }
    }),
  );

  for (const links of batches) {
    for (const link of links) {
      if (!found.includes(link)) found.push(link);
    }
  }

  return found;
}

function parseLlmsLinks(text: string, siteRoot: string): string[] {
  const urls: string[] = [];
  const mdLink = /\[([^\]]*)\]\(([^)]+)\)/g;
  let m: RegExpExecArray | null;
  while ((m = mdLink.exec(text)) !== null) {
    const href = m[2]?.trim();
    if (href && !href.startsWith('#')) addUrl(href, siteRoot, urls);
  }

  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
      addUrl(trimmed.split(/\s/)[0]!, siteRoot, urls);
    }
  }

  return urls;
}

function addUrl(href: string, siteRoot: string, out: string[]): void {
  try {
    if (!sameTargetSite(href, siteRoot)) return;
    const norm = canonicalPageUrl(href, siteRoot);
    if (!out.includes(norm)) out.push(norm);
  } catch {
    /* ignore */
  }
}
