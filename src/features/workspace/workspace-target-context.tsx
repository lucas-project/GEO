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
import { normalizeWebsiteUrl } from '@/lib/website-url';

const STORAGE_KEY = 'geo_workspace_target_v1';

type PersistedShape = {
  targetUrl: string;
  lastAuditId: string | null;
  lastAuditForUrl: string | null;
  targetBrand: string;
};

const defaultPersisted: PersistedShape = {
  targetUrl: '',
  lastAuditId: null,
  lastAuditForUrl: null,
  targetBrand: '',
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
  setTargetUrl: (v: string) => void;
  setTargetBrand: (v: string) => void;
  /** Call when a GEO audit completes for the current workspace URL. */
  registerCompletedAudit: (auditId: string, auditedRawUrl: string) => void;
  clearLastAudit: () => void;
  clearAll: () => void;
  commitTargetUrl: () => void;
};

const WorkspaceTargetContext = createContext<WorkspaceTargetContextValue | null>(null);

export function WorkspaceTargetProvider({ children }: { children: ReactNode }) {
  const [hydrated, setHydrated] = useState(false);
  const [targetUrl, setTargetUrlState] = useState('');
  const [lastAuditId, setLastAuditId] = useState<string | null>(null);
  const [lastAuditForUrl, setLastAuditForUrl] = useState<string | null>(null);
  const [targetBrand, setTargetBrandState] = useState('');

  useEffect(() => {
    const p = readPersisted();
    setTargetUrlState(p.targetUrl);
    setLastAuditId(p.lastAuditId);
    setLastAuditForUrl(p.lastAuditForUrl);
    setTargetBrandState(p.targetBrand);
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const payload: PersistedShape = {
      targetUrl,
      lastAuditId,
      lastAuditForUrl,
      targetBrand,
    };
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch {
      /* quota */
    }
  }, [targetUrl, lastAuditId, lastAuditForUrl, targetBrand, hydrated]);

  const setTargetUrl = useCallback((v: string) => {
    setTargetUrlState(v);
  }, []);

  /** When the user finishes editing the URL bar, drop the audit shortcut if the site no longer matches. */
  const commitTargetUrl = useCallback(() => {
    if (!lastAuditId || !lastAuditForUrl) return;
    const raw = targetUrl.trim();
    if (!raw) return;
    try {
      const u = normalizeWebsiteUrl(raw);
      if (u !== lastAuditForUrl) {
        setLastAuditId(null);
        setLastAuditForUrl(null);
      }
    } catch {
      /* ignore */
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

  const clearAll = useCallback(() => {
    setTargetUrlState('');
    setLastAuditId(null);
    setLastAuditForUrl(null);
    setTargetBrandState('');
  }, []);

  const value = useMemo<WorkspaceTargetContextValue>(
    () => ({
      hydrated,
      targetUrl,
      lastAuditId,
      lastAuditForUrl,
      targetBrand,
      setTargetUrl,
      setTargetBrand: setTargetBrandState,
      registerCompletedAudit,
      clearLastAudit,
      clearAll,
      commitTargetUrl,
    }),
    [
      hydrated,
      targetUrl,
      lastAuditId,
      lastAuditForUrl,
      targetBrand,
      setTargetUrl,
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
