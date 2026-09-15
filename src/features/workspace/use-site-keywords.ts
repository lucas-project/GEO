'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api-client';
import { normalizeWebsiteUrl } from '@/lib/website-url';

const DEBOUNCE_MS = 700;

export interface SiteKeywordsDetected {
  keywords: string[];
  forUrl: string;
}

export function siteKeywordsMatchUrl(
  keywordsForUrl: string | null,
  rawUrl: string,
): boolean {
  if (!keywordsForUrl || !rawUrl.trim()) return false;
  try {
    const normalized = normalizeWebsiteUrl(
      rawUrl.trim().includes('://') ? rawUrl.trim() : `https://${rawUrl.trim()}`,
    );
    return normalized === keywordsForUrl;
  } catch {
    return false;
  }
}

export function useSiteKeywords(
  siteUrl: string,
  hydrated: boolean,
  onDetected: (result: SiteKeywordsDetected | null) => void,
  enabled = true,
) {
  const [loading, setLoading] = useState(false);
  const requestId = useRef(0);

  const fetchKeywords = useCallback(
    async (rawUrl: string) => {
      const trimmed = rawUrl.trim();
      if (!trimmed) {
        setLoading(false);
        onDetected(null);
        return;
      }

      let normalized: string;
      try {
        normalized = normalizeWebsiteUrl(trimmed.includes('://') ? trimmed : `https://${trimmed}`);
      } catch {
        setLoading(false);
        onDetected(null);
        return;
      }

      const id = ++requestId.current;
      setLoading(true);

      try {
        const res = await api.post<{ keywords: string[] }>('/api/site-keywords', {
          siteUrl: normalized,
        });
        if (id !== requestId.current) return;
        const keywords = res.keywords ?? [];
        onDetected({ keywords, forUrl: normalized });
      } catch {
        if (id !== requestId.current) return;
        onDetected({ keywords: [], forUrl: normalized });
      } finally {
        if (id === requestId.current) setLoading(false);
      }
    },
    [onDetected],
  );

  useEffect(() => {
    if (!hydrated || !enabled) {
      setLoading(false);
      return;
    }
    const trimmed = siteUrl.trim();
    if (!trimmed) {
      setLoading(false);
      onDetected(null);
      return;
    }

    const timer = setTimeout(() => {
      void fetchKeywords(trimmed);
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [siteUrl, hydrated, enabled, fetchKeywords, onDetected]);

  return {
    loading,
    refreshKeywords: () => fetchKeywords(siteUrl),
  };
}
