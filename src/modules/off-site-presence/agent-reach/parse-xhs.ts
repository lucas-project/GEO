import type { XhsNoteHit } from './types';

function normalizeXhsUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    const u = new URL(trimmed.startsWith('http') ? trimmed : `https://${trimmed}`);
    if (!u.hostname.includes('xiaohongshu.com')) return null;
    return u.href;
  } catch {
    return null;
  }
}

/** Parse xhs search stdout (JSON array or line-oriented fallback). */
export function parseXhsSearchOutput(stdout: string): XhsNoteHit[] {
  const trimmed = stdout.trim();
  if (!trimmed) return [];

  if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      return parseXhsJson(parsed);
    } catch {
      /* fall through */
    }
  }

  return parseXhsLines(stdout);
}

function parseXhsJson(data: unknown): XhsNoteHit[] {
  const items: unknown[] = Array.isArray(data)
    ? data
    : data && typeof data === 'object' && Array.isArray((data as { data?: unknown }).data)
      ? ((data as { data: unknown[] }).data ?? [])
      : data && typeof data === 'object' && Array.isArray((data as { notes?: unknown }).notes)
        ? ((data as { notes: unknown[] }).notes ?? [])
        : [];

  const out: XhsNoteHit[] = [];
  for (const item of items) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    const title =
      (typeof row.title === 'string' && row.title) ||
      (typeof row.display_title === 'string' && row.display_title) ||
      (typeof row.note_card === 'object' &&
        row.note_card &&
        typeof (row.note_card as { display_title?: string }).display_title === 'string' &&
        (row.note_card as { display_title: string }).display_title) ||
      '';
    const urlRaw =
      (typeof row.url === 'string' && row.url) ||
      (typeof row.note_url === 'string' && row.note_url) ||
      (typeof row.link === 'string' && row.link) ||
      (typeof row.id === 'string' && `https://www.xiaohongshu.com/explore/${row.id}`) ||
      '';
    const url = normalizeXhsUrl(urlRaw);
    if (!title || title.length < 3 || !url) continue;
    out.push({
      title: title.slice(0, 300),
      url,
      likes: typeof row.liked_count === 'number' ? row.liked_count : undefined,
      comments: typeof row.comment_count === 'number' ? row.comment_count : undefined,
    });
  }
  return dedupeXhs(out);
}

function parseXhsLines(stdout: string): XhsNoteHit[] {
  const out: XhsNoteHit[] = [];
  const urlRe = /https?:\/\/[^\s]*xiaohongshu\.com[^\s)"]*/gi;
  const lines = stdout.split(/\r?\n/);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const urls = line.match(urlRe);
    if (!urls?.length) continue;
    for (const rawUrl of urls) {
      const url = normalizeXhsUrl(rawUrl);
      if (!url) continue;
      let title = line.replace(urlRe, '').replace(/^[-*\d.]+\s*/, '').trim();
      if (title.length < 5 && i > 0) {
        title = lines[i - 1]!.replace(urlRe, '').trim();
      }
      if (title.length < 3) title = 'Xiaohongshu note';
      out.push({ title: title.slice(0, 300), url });
    }
  }
  return dedupeXhs(out);
}

function dedupeXhs(hits: XhsNoteHit[]): XhsNoteHit[] {
  const seen = new Set<string>();
  const out: XhsNoteHit[] = [];
  for (const h of hits) {
    if (seen.has(h.url)) continue;
    seen.add(h.url);
    out.push(h);
  }
  return out;
}
