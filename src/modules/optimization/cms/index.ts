/**
 * CMS patcher interfaces — WordPress REST draft publish when env is configured.
 */

import { config } from '@shared/config';

export interface CmsPatchInput {
  url: string;
  artifactType: 'faq-schema' | 'llms-txt' | 'ai-summary' | 'answer-first' | 'product-schema' | 'metadata';
  content: string;
}

export interface CmsPatchResult {
  applied: boolean;
  message: string;
  diff?: string;
}

export interface CmsAdapter {
  readonly name: string;
  matches(url: string): boolean;
  applyPatch(input: CmsPatchInput): Promise<CmsPatchResult>;
}

function hostnameOf(u: string): string | null {
  try {
    return new URL(u).hostname.toLowerCase();
  } catch {
    return null;
  }
}

class WordPressAdapter implements CmsAdapter {
  readonly name = 'wordpress';

  matches(url: string): boolean {
    const base = config.wordpress.baseUrl.trim();
    if (!base || !config.wordpress.username || !config.wordpress.appPassword) return false;
    const h = hostnameOf(url);
    const b = hostnameOf(base);
    return Boolean(h && b && h === b);
  }

  async applyPatch(input: CmsPatchInput): Promise<CmsPatchResult> {
    const base = config.wordpress.baseUrl.replace(/\/$/, '');
    const auth = Buffer.from(`${config.wordpress.username}:${config.wordpress.appPassword}`).toString(
      'base64',
    );
    const res = await fetch(`${base}/wp-json/wp/v2/posts`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title: `GEO ${input.artifactType} (draft)`,
        status: 'draft',
        content: `<!-- wp:html -->\n${input.content}\n<!-- /wp:html -->`,
      }),
    });
    const text = await res.text();
    if (!res.ok) {
      return { applied: false, message: `WordPress REST error ${res.status}: ${text.slice(0, 400)}` };
    }
    try {
      const json = JSON.parse(text) as { id?: number; link?: string };
      return {
        applied: true,
        message: `Draft post created (id ${json.id ?? '?'})`,
        diff: json.link,
      };
    } catch {
      return { applied: true, message: 'Draft post created', diff: text.slice(0, 200) };
    }
  }
}

class ShopifyAdapter implements CmsAdapter {
  readonly name = 'shopify';
  matches(_url: string): boolean {
    return false;
  }
  async applyPatch(_input: CmsPatchInput): Promise<CmsPatchResult> {
    return { applied: false, message: 'Shopify live-patching is not implemented yet.' };
  }
}

const ADAPTERS: CmsAdapter[] = [new WordPressAdapter(), new ShopifyAdapter()];

export function pickAdapter(url: string): CmsAdapter | null {
  return ADAPTERS.find((a) => a.matches(url)) ?? null;
}
