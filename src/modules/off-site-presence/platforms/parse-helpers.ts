import * as cheerio from 'cheerio';
import { detectBlockedPage } from '@modules/crawling/blocked-page';

export function parseCount(text: string | undefined): number {
  if (!text) return 0;
  const cleaned = text.replace(/,/g, '').trim();
  const k = /([\d.]+)\s*k/i.exec(cleaned);
  if (k) return Math.round(parseFloat(k[1]!) * 1000);
  const m = /([\d.]+)\s*m/i.exec(cleaned);
  if (m) return Math.round(parseFloat(m[1]!) * 1_000_000);
  const n = parseInt(cleaned.replace(/[^\d]/g, ''), 10);
  return Number.isFinite(n) ? n : 0;
}

export function detectCaptchaOrBlock(
  html: string,
  title: string | null,
  statusCode = 200,
): boolean {
  return detectBlockedPage({ statusCode, html, title }).blocked;
}

export function detectLoginWall(html: string): boolean {
  const lower = html.toLowerCase();
  return (
    lower.includes('log in to continue') ||
    lower.includes('sign in to quora') ||
    lower.includes('continue with google')
  );
}

export function firstMatchingText(
  $: cheerio.CheerioAPI,
  selectors: string[],
): string | null {
  for (const sel of selectors) {
    const t = $(sel).first().text().trim();
    if (t) return t;
  }
  return null;
}

export function parseRating(text: string | undefined): number | undefined {
  if (!text) return undefined;
  const m = /([\d.]+)\s*(?:\/\s*5|out of 5|stars?)?/i.exec(text);
  if (m) {
    const v = parseFloat(m[1]!);
    if (v >= 0 && v <= 5) return v;
  }
  return undefined;
}
