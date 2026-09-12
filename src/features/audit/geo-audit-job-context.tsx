'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import { isInterruptedJobError } from '@/lib/jobs';
import { useAsyncJob } from '@/hooks/use-async-job';
import { BACKGROUND_JOB_KEYS } from '@/lib/background-job-keys';
import { BACKGROUND_JOB_UI } from '@/lib/background-job-ui';
import { useWorkspaceTarget } from '@/features/workspace/workspace-target-context';
import { normalizeWebsiteUrl } from '@/lib/website-url';
import {
  defaultGeoSelection,
  discoverSitePages,
  type DiscoverResult,
} from './audit-page-picker';

const JOB_STORAGE_KEY = BACKGROUND_JOB_KEYS.audit;
const SUBMITTED_URL_KEY = 'geo:audit-job-url';
const DISCOVERY_STORAGE_KEY = 'geo:audit-discovery';
export const PENDING_AUDIT_REPORT_KEY = 'geo:audit-pending-report';

type StoredDiscovery = {
  siteUrl: string;
  discovered: DiscoverResult;
  selectedKeys: string[];
};

export function normalizeAuditSiteUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return '';
  try {
    return normalizeWebsiteUrl(trimmed.startsWith('http') ? trimmed : `https://${trimmed}`);
  } catch {
    return trimmed.toLowerCase();
  }
}

function readStoredDiscovery(): StoredDiscovery | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(DISCOVERY_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredDiscovery;
    if (!parsed.siteUrl || !parsed.discovered?.pages) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeStoredDiscovery(data: StoredDiscovery | null): void {
  if (typeof window === 'undefined') return;
  if (!data) {
    sessionStorage.removeItem(DISCOVERY_STORAGE_KEY);
    return;
  }
  sessionStorage.setItem(DISCOVERY_STORAGE_KEY, JSON.stringify(data));
}

export interface GeoAuditJobPayload {
  url: string;
  pageUrls?: string[];
  maxPages?: number;
  pageRankings?: Array<{
    url: string;
    geoScore: number;
    archetype?: DiscoverResult['pages'][number]['archetype'];
    signals?: string[];
    probed?: boolean;
  }>;
}

interface AuditJobResult {
  auditId?: string;
}

function readSubmittedUrl(): string {
  if (typeof window === 'undefined') return '';
  return sessionStorage.getItem(SUBMITTED_URL_KEY) ?? '';
}

function writeSubmittedUrl(url: string): void {
  if (typeof window === 'undefined') return;
  if (url) sessionStorage.setItem(SUBMITTED_URL_KEY, url);
  else sessionStorage.removeItem(SUBMITTED_URL_KEY);
}

type GeoAuditJobContextValue = {
  isRunning: boolean;
  isInterrupted: boolean;
  failedError: string | null;
  jobId: string | null;
  job: ReturnType<typeof useAsyncJob<GeoAuditJobPayload, AuditJobResult>>['job'];
  jobQuery: ReturnType<typeof useAsyncJob<GeoAuditJobPayload, AuditJobResult>>['jobQuery'];
  progress: number;
  enqueueError: Error | null;
  startAudit: (payload: GeoAuditJobPayload, submittedUrl: string) => void;
  resetAudit: () => void;
  cancelAudit: () => Promise<void>;
  discovering: boolean;
  discoverError: string | null;
  discovered: DiscoverResult | null;
  discoverySiteUrl: string | null;
  selected: Set<string>;
  setSelected: (next: Set<string>) => void;
  findPages: (siteUrl: string) => Promise<void>;
  clearPageDiscovery: () => void;
};

const GeoAuditJobContext = createContext<GeoAuditJobContextValue | null>(null);

export function GeoAuditJobProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const { registerCompletedAudit } = useWorkspaceTarget();
  const handledCompleteRef = useRef<string | null>(null);
  const discoverGenerationRef = useRef(0);

  const finishAudit = useCallback(
    (auditId: string, submittedUrl: string) => {
      if (submittedUrl) registerCompletedAudit(auditId, submittedUrl);
      writeSubmittedUrl('');
      sessionStorage.setItem(PENDING_AUDIT_REPORT_KEY, auditId);
      void queryClient.invalidateQueries({ queryKey: ['recent-audits'] });
      void queryClient.invalidateQueries({ queryKey: ['cmp-audit-id'] });
      void queryClient.invalidateQueries({ queryKey: ['cmp-audit-suggestions'] });
      void queryClient.prefetchQuery({
        queryKey: ['geo-audit', auditId],
        queryFn: () => api.get(`/api/geo-audit/${auditId}`),
      });

      if (pathname === '/audit') {
        sessionStorage.removeItem(PENDING_AUDIT_REPORT_KEY);
        router.push(`/audit/${auditId}`);
      }
    },
    [pathname, queryClient, registerCompletedAudit, router],
  );

  const [discovering, setDiscovering] = useState(false);
  const [discoverError, setDiscoverError] = useState<string | null>(null);
  const [failedError, setFailedError] = useState<string | null>(null);
  const [discovered, setDiscovered] = useState<DiscoverResult | null>(null);
  const [discoverySiteUrl, setDiscoverySiteUrl] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    const stored = readStoredDiscovery();
    if (!stored) return;
    const norm = normalizeAuditSiteUrl(stored.siteUrl);
    setDiscoverySiteUrl(norm);
    setDiscovered(stored.discovered);
    setSelected(new Set(stored.selectedKeys));
  }, []);

  const persistDiscovery = useCallback(
    (siteUrl: string, result: DiscoverResult, selection: Set<string>) => {
      writeStoredDiscovery({
        siteUrl,
        discovered: result,
        selectedKeys: [...selection],
      });
    },
    [],
  );

  const clearPageDiscovery = useCallback(() => {
    discoverGenerationRef.current += 1;
    setDiscovering(false);
    setDiscoverError(null);
    setDiscovered(null);
    setDiscoverySiteUrl(null);
    setSelected(new Set());
    writeStoredDiscovery(null);
  }, []);

  const findPages = useCallback(
    async (rawSiteUrl: string) => {
      const siteUrl = normalizeAuditSiteUrl(rawSiteUrl);
      if (!siteUrl) return;
      const generation = ++discoverGenerationRef.current;
      setDiscovering(true);
      setDiscoverError(null);
      setDiscovered(null);
      setDiscoverySiteUrl(siteUrl);
      setSelected(new Set());
      writeStoredDiscovery(null);
      try {
        const result = await discoverSitePages(rawSiteUrl.trim());
        if (discoverGenerationRef.current !== generation) return;
        const selection = defaultGeoSelection(result);
        setDiscovered(result);
        setSelected(selection);
        setDiscoverySiteUrl(siteUrl);
        persistDiscovery(siteUrl, result, selection);
      } catch (e) {
        if (discoverGenerationRef.current !== generation) return;
        setDiscoverError(e instanceof Error ? e.message : 'Could not discover pages');
      } finally {
        if (discoverGenerationRef.current === generation) {
          setDiscovering(false);
        }
      }
    },
    [persistDiscovery],
  );

  const setSelectedPersisted = useCallback(
    (next: Set<string>) => {
      setSelected(next);
      if (discovered && discoverySiteUrl) {
        persistDiscovery(discoverySiteUrl, discovered, next);
      }
    },
    [discovered, discoverySiteUrl, persistDiscovery],
  );

  const {
    enqueue,
    mutate,
    reset,
    cancelJob,
    isRunning,
    isInterrupted,
    jobId,
    job,
    jobQuery,
    progress,
  } = useAsyncJob<GeoAuditJobPayload, AuditJobResult>({
    queryKeyPrefix: 'geo-audit',
    pollIntervalMs: 1500,
    persistKey: JOB_STORAGE_KEY,
    background: BACKGROUND_JOB_UI.audit,
    clearJobOnComplete: true,
    clearJobOnFailed: true,
    mutationFn: async (payload) => api.post<{ jobId: string }>('/api/geo-audit', payload),
    onCompleted: (result) => {
      setFailedError(null);
      if (!result?.auditId) return;
      const key = `completed:${result.auditId}`;
      if (handledCompleteRef.current === key) return;
      handledCompleteRef.current = key;
      finishAudit(result.auditId, readSubmittedUrl());
    },
    onFailed: (error) => {
      if (error) setFailedError(error);
    },
  });

  useEffect(() => {
    handledCompleteRef.current = null;
  }, [jobId]);

  /** Resume after navigation when job already completed (same session). */
  useEffect(() => {
    if (!jobId || job?.status !== 'completed') return;
    const auditId =
      job.result?.auditId ??
      (job.result && typeof job.result === 'object' && 'auditId' in job.result
        ? (job.result as AuditJobResult).auditId
        : undefined);
    if (!auditId) return;
    const key = `${jobId}:completed:${auditId}`;
    if (handledCompleteRef.current === key) return;
    handledCompleteRef.current = key;
    finishAudit(auditId, readSubmittedUrl());
  }, [job, jobId, finishAudit]);

  const startAudit = useCallback(
    (payload: GeoAuditJobPayload, submittedUrl: string) => {
      writeSubmittedUrl(submittedUrl);
      handledCompleteRef.current = null;
      setFailedError(null);
      reset();
      mutate(payload);
    },
    [mutate, reset],
  );

  const resetAudit = useCallback(() => {
    writeSubmittedUrl('');
    handledCompleteRef.current = null;
    setFailedError(null);
    reset();
  }, [reset]);

  const cancelAudit = useCallback(async () => {
    await cancelJob();
    setFailedError(null);
    writeSubmittedUrl('');
    handledCompleteRef.current = null;
    reset();
  }, [cancelJob, reset]);

  const value = useMemo(
    () => ({
      isRunning,
      isInterrupted: isInterrupted || isInterruptedJobError(failedError ?? undefined),
      failedError,
      jobId,
      job,
      jobQuery,
      progress,
      enqueueError: (enqueue.error as Error | null) ?? null,
      startAudit,
      resetAudit,
      cancelAudit,
      discovering,
      discoverError,
      discovered,
      discoverySiteUrl,
      selected,
      setSelected: setSelectedPersisted,
      findPages,
      clearPageDiscovery,
    }),
    [
      isRunning,
      isInterrupted,
      failedError,
      jobId,
      job,
      jobQuery,
      progress,
      enqueue.error,
      startAudit,
      resetAudit,
      cancelAudit,
      discovering,
      discoverError,
      discovered,
      discoverySiteUrl,
      selected,
      setSelectedPersisted,
      findPages,
      clearPageDiscovery,
    ],
  );

  return <GeoAuditJobContext.Provider value={value}>{children}</GeoAuditJobContext.Provider>;
}

export function useGeoAuditJob(): GeoAuditJobContextValue {
  const ctx = useContext(GeoAuditJobContext);
  if (!ctx) {
    throw new Error('useGeoAuditJob must be used within GeoAuditJobProvider');
  }
  return ctx;
}

export function useGeoAuditJobOptional(): GeoAuditJobContextValue | null {
  return useContext(GeoAuditJobContext);
}
