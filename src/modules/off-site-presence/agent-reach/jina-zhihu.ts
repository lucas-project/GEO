import { config } from '@shared/config';
import type { SearchHit } from '../search-engine';

const JINA_ZHIHU_MAX = 5;
const JINA_TITLE_MAX = 280;

function extractJinaTitle(body: string, fallback?: string): string | undefined {
  const lines = body.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const titleLine = lines.find((l) => l.length >= 8 && l.length <= JINA_TITLE_MAX && !/^https?:/i.test(l));
  if (titleLine) return titleLine.slice(0, JINA_TITLE_MAX);
  const first = lines[0];
  if (first && first.length >= 8) return first.slice(0, JINA_TITLE_MAX);
  return fallback;
}

async function fetchJinaReader(url: string, timeoutMs: number): Promise<string | null> {
  const jinaUrl = `https://r.jina.ai/${url}`;
  try {
    const res = await fetch(jinaUrl, {
      headers: { Accept: 'text/plain' },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

/** Enrich existing Zhihu SERP hits with Jina Reader titles/snippets. */
export async function enrichZhihuHitsWithJina(
  hits: SearchHit[],
  timeoutMs?: number,
): Promise<{ hits: SearchHit[]; enriched: number }> {
  const cap = Math.min(JINA_ZHIHU_MAX, hits.length);
  const perHitTimeout = Math.max(
    4000,
    Math.floor((timeoutMs ?? config.presenceProbe.agentReachTimeoutMs) / cap),
  );

  let enriched = 0;
  const out = [...hits];

  for (let i = 0; i < cap; i++) {
    const hit = out[i]!;
    if (!/zhihu\.com/i.test(hit.url)) continue;

    const body = await fetchJinaReader(hit.url, perHitTimeout);
    if (!body) continue;

    const title = extractJinaTitle(body, hit.title);
    if (title && title !== hit.title) {
      out[i] = {
        ...hit,
        title,
        snippet: body.slice(0, 400),
        engine: 'jina',
      };
      enriched++;
    }
  }

  return { hits: out, enriched };
}
