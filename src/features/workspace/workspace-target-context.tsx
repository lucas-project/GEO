'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { brandMatchesUrl } from '@/lib/brand-url-match';
import { normalizeWebsiteUrl, sameTargetSite } from '@/lib/website-url';
import { useQuery } from '@tanstack/react-query';
import { usePathname } from 'next/navigation';
import { api } from '@/lib/api-client';
import { siteKeywordsMatchUrl, useSiteKeywords } from './use-site-keywords';

const STORAGE_KEY = 'geo_workspace_target_v1';

type PersistedShape = {
  targetUrl: string;
  lastAuditId: string | null;
  lastAuditForUrl: string | null;
  targetBrand: string;
  siteKeywords: string[];
  siteKeywordsForUrl: string | null;
};

const defaultPersisted: PersistedShape = {
  targetUrl: '',
  lastAuditId: null,
  lastAuditForUrl: null,
  targetBrand: '',
  siteKeywords: [],
  siteKeywordsForUrl: null,
};

function readPersisted(): PersistedShape {
  if (typeof window === 'undefined') return defaultPersisted;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultPersisted;
    const p = JSON.parse(raw) as Partial<PersistedShape>;
    return {
      targetUrl: typeof p.targetUrl === 'string' ? p.targetUrl : '',
      lastAuditId: typeof p.lastAuditId === 'string' ? p.lastAuditId : null,
      lastAuditForUrl: typeof p.lastAuditForUrl === 'string' ? p.lastAuditForUrl : null,
      targetBrand: typeof p.targetBrand === 'string' ? p.targetBrand : '',
      siteKeywords: Array.isArray(p.siteKeywords)
        ? p.siteKeywords.filter((k): k is string => typeof k === 'string').slice(0, 10)
        : [],
      siteKeywordsForUrl:
        typeof p.siteKeywordsForUrl === 'string' ? p.siteKeywordsForUrl : null,
    };
  } catch {
    return defaultPersisted;
  }
}

function hostnameHint(url: string): string {
  const t = url.trim();
  if (!t) return '';
  try {
    return new URL(t.includes('://') ? t : `https://${t}`).hostname.replace(/^www\./i, '');
  } catch {
    return t;
  }
}

type WorkspaceTargetContextValue = PersistedShape & {
  /** Hydration finished — safe to read persisted values in children. */
  hydrated: boolean;
  reportResolved: boolean;
  /** All terms detected from the site (for chip UI). */
  siteKeywordSuggestions: string[];
  siteKeywordsLoading: boolean;
  siteKeywordsError: string | null;
  setTargetUrl: (v: string) => void;
  setTargetBrand: (v: string) => void;
  setSiteKeywords: (keywords: string[]) => void;
  refreshSiteKeywords: () => void;
  toggleSiteKeyword: (term: string) => void;
  /** Selected keywords apply to the current workspace URL (after detection). */
  siteKeywordsReadyForUrl: (rawUrl: string) => boolean;
  /** Call when a GEO audit completes for the current workspace URL. */
  registerCompletedAudit: (auditId: string, auditedRawUrl: string) => void;
  clearLastAudit: () => void;
  clearAll: () => void;
  commitTargetUrl: () => void;
};

const WorkspaceTargetContext = createContext<WorkspaceTargetContextValue | null>(null);

export function WorkspaceTargetProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [hydrated, setHydrated] = useState(false);
  const [targetUrl, setTargetUrlState] = useState('');
  const [lastAuditId, setLastAuditId] = useState<string | null>(null);
  const [lastAuditForUrl, setLastAuditForUrl] = useState<string | null>(null);
  const [targetBrand, setTargetBrandState] = useState('');
  const [siteKeywords, setSiteKeywordsState] = useState<string[]>([]);
  const [siteKeywordsForUrl, setSiteKeywordsForUrlState] = useState<string | null>(null);
  const [siteKeywordSuggestions, setSiteKeywordSuggestions] = useState<string[]>([]);
  const [siteKeywordsError, setSiteKeywordsError] = useState<string | null>(null);

  const resolvedReport = useQuery<{ auditId: string | null; requestedId: string | null }>({
    queryKey: ['workspace-report', targetUrl, lastAuditId],
    enabled: hydrated && Boolean(targetUrl.trim()),
    queryFn: async () => {
      const requestedId = lastAuditId;
      const result = await api.get<{ auditId: string | null }>(`/api/geo-audit?url=${encodeURIComponent(targetUrl)}&auditId=${encodeURIComponent(requestedId ?? '')}`);
      return { ...result, requestedId };
    },
  });
  useEffect(() => {
    if (!resolvedReport.data) return;
    // An explicit report selection (including opening a historical report) wins
    // over a concurrently resolving "latest report" lookup for the same site.
    if (lastAuditId && lastAuditForUrl && sameTargetSite(targetUrl, lastAuditForUrl)) return;
    if (resolvedReport.data.requestedId !== lastAuditId) return;
    setLastAuditId(resolvedReport.data.auditId);
    setLastAuditForUrl(resolvedReport.data.auditId ? normalizeWebsiteUrl(targetUrl) : null);
  }, [resolvedReport.data, targetUrl, lastAuditId, lastAuditForUrl]);

  useEffect(() => {
    const p = readPersisted();
    setTargetUrlState(p.targetUrl);
    setLastAuditId(p.lastAuditId);
    setLastAuditForUrl(p.lastAuditForUrl);
    setTargetBrandState(p.targetBrand);
    setSiteKeywordsState(p.siteKeywords);
    setSiteKeywordsForUrlState(p.siteKeywordsForUrl);
    setSiteKeywordSuggestions(p.siteKeywords);
    setHydrated(true);
    const reportId = window.location.pathname.match(/^\/audit\/([^/]+)$/)?.[1];
    if (reportId) {
      void api.get<{ audit: { id: string; url: string; status?: string } }>(`/api/geo-audit/${reportId}`).then(({ audit }) => {
        if (audit.status !== 'completed' && audit.status !== 'partial') return;
        setTargetUrlState(audit.url);
        setLastAuditId(audit.id);
        setLastAuditForUrl(normalizeWebsiteUrl(audit.url));
      }).catch(() => {});
    }
  }, []);

  const onKeywordsDetected = useCallback(
    (result: { keywords: string[]; forUrl: string } | null) => {
      if (!result) {
        setSiteKeywordSuggestions([]);
        setSiteKeywordsState([]);
        setSiteKeywordsForUrlState(null);
        setSiteKeywordsError(null);
        return;
      }
      setSiteKeywordSuggestions(result.keywords);
      setSiteKeywordsState(result.keywords);
      setSiteKeywordsForUrlState(result.forUrl);
      setSiteKeywordsError(
        result.keywords.length === 0 ? 'No keywords detected — try a page with more text.' : null,
      );
    },
    [],
  );

  const { loading: siteKeywordsLoading, refreshKeywords: refreshSiteKeywords } =
    useSiteKeywords(
      targetUrl,
      hydrated,
      onKeywordsDetected,
      pathname === '/presence' || pathname === '/simulate',
    );

  useEffect(() => {
    if (!hydrated) return;
    const payload: PersistedShape = {
      targetUrl,
      lastAuditId,
      lastAuditForUrl,
      targetBrand,
      siteKeywords,
      siteKeywordsForUrl,
    };
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch {
      /* quota */
    }
  }, [targetUrl, lastAuditId, lastAuditForUrl, targetBrand, siteKeywords, siteKeywordsForUrl, hydrated]);

  const setTargetUrl = useCallback((v: string) => {
    setTargetUrlState(v);
    if (!lastAuditForUrl || !sameTargetSite(v, lastAuditForUrl)) {
      setLastAuditId(null);
      setLastAuditForUrl(null);
    }
  }, [lastAuditForUrl]);

  /** When the user finishes editing the URL bar, drop the audit shortcut if the site no longer matches. */
  const commitTargetUrl = useCallback(() => {
    const raw = targetUrl.trim();
    if (raw) {
      try {
        const u = normalizeWebsiteUrl(raw);
        if (lastAuditId && lastAuditForUrl && !sameTargetSite(u, lastAuditForUrl)) {
          setLastAuditId(null);
          setLastAuditForUrl(null);
        }
        setTargetBrandState((prev) => {
          if (!prev.trim()) return prev;
          return brandMatchesUrl(prev, u) ? prev : '';
        });
      } catch {
        /* ignore */
      }
    }
  }, [targetUrl, lastAuditId, lastAuditForUrl]);

  const registerCompletedAudit = useCallback((auditId: string, auditedRawUrl: string) => {
    const normalized = normalizeWebsiteUrl(auditedRawUrl.trim());
    setLastAuditId(auditId);
    setLastAuditForUrl(normalized);
    const hint = hostnameHint(auditedRawUrl);
    setTargetBrandState((prev) => (prev.trim() ? prev : hint.split('.')[0] ?? prev));
  }, []);

  const clearLastAudit = useCallback(() => {
    setLastAuditId(null);
    setLastAuditForUrl(null);
  }, []);

  const setSiteKeywords = useCallback((keywords: string[]) => {
    setSiteKeywordsState(keywords.slice(0, 10));
  }, []);

  const toggleSiteKeyword = useCallback((term: string) => {
    setSiteKeywordsState((prev) => {
      const lower = term.toLowerCase();
      if (prev.some((k) => k.toLowerCase() === lower)) {
        return prev.filter((k) => k.toLowerCase() !== lower);
      }
      return [...prev, term].slice(0, 10);
    });
  }, []);

  const siteKeywordsReadyForUrl = useCallback(
    (rawUrl: string) => siteKeywordsMatchUrl(siteKeywordsForUrl, rawUrl),
    [siteKeywordsForUrl],
  );

  const clearAll = useCallback(() => {
    setTargetUrlState('');
    setLastAuditId(null);
    setLastAuditForUrl(null);
    setTargetBrandState('');
    setSiteKeywordsState([]);
    setSiteKeywordsForUrlState(null);
    setSiteKeywordSuggestions([]);
    setSiteKeywordsError(null);
  }, []);

  const value = useMemo<WorkspaceTargetContextValue>(
    () => ({
      hydrated,
      reportResolved: Boolean(resolvedReport.data && resolvedReport.data.auditId === lastAuditId),
      targetUrl,
      lastAuditId,
      lastAuditForUrl,
      targetBrand,
      siteKeywords,
      siteKeywordsForUrl,
      siteKeywordSuggestions,
      siteKeywordsLoading,
      siteKeywordsError,
      setTargetUrl,
      setTargetBrand: setTargetBrandState,
      setSiteKeywords,
      refreshSiteKeywords,
      toggleSiteKeyword,
      siteKeywordsReadyForUrl,
      registerCompletedAudit,
      clearLastAudit,
      clearAll,
      commitTargetUrl,
    }),
    [
      hydrated,
      resolvedReport.data,
      targetUrl,
      lastAuditId,
      lastAuditForUrl,
      targetBrand,
      siteKeywords,
      siteKeywordsForUrl,
      siteKeywordSuggestions,
      siteKeywordsLoading,
      siteKeywordsError,
      setTargetUrl,
      setSiteKeywords,
      refreshSiteKeywords,
      toggleSiteKeyword,
      siteKeywordsReadyForUrl,
      registerCompletedAudit,
      clearLastAudit,
      clearAll,
      commitTargetUrl,
    ],
  );

  return <WorkspaceTargetContext.Provider value={value}>{children}</WorkspaceTargetContext.Provider>;
}

export function useWorkspaceTarget(): WorkspaceTargetContextValue {
  const ctx = useContext(WorkspaceTargetContext);
  if (!ctx) {
    throw new Error('useWorkspaceTarget must be used within WorkspaceTargetProvider');
  }
  return ctx;
}

/** Optional: use in pages that may render outside the dashboard shell (e.g. tests). */
export function useWorkspaceTargetOptional(): WorkspaceTargetContextValue | null {
  return useContext(WorkspaceTargetContext);
}

export { hostnameHint };
