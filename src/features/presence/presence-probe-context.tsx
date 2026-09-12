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
import { api } from '@/lib/api-client';
import { isInterruptedJobError } from '@/lib/jobs';
import { useAsyncJob } from '@/hooks/use-async-job';
import { BACKGROUND_JOB_KEYS } from '@/lib/background-job-keys';
import { BACKGROUND_JOB_UI } from '@/lib/background-job-ui';
import { useWorkspaceTarget } from '@/features/workspace/workspace-target-context';
import { normalizeWebsiteUrl } from '@/lib/website-url';
import type { OffSitePresenceReport } from '@modules/off-site-presence';

const JOB_STORAGE_KEY = BACKGROUND_JOB_KEYS.presence;
const REPORT_STORAGE_KEY = 'geo:presence-probe-report';

interface ProbeJobResult {
  report: OffSitePresenceReport;
}

export function extractProbeReport(result: unknown): OffSitePresenceReport | null {
  if (!result || typeof result !== 'object') return null;
  const r = result as Record<string, unknown>;
  if (r.report && typeof r.report === 'object') {
    return r.report as OffSitePresenceReport;
  }
  if (r.meta && r.platforms && r.scores) {
    return result as OffSitePresenceReport;
  }
  return null;
}

function readStoredReport(): OffSitePresenceReport | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(REPORT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { report?: OffSitePresenceReport };
    return parsed.report && parsed.report.meta ? parsed.report : null;
  } catch {
    return null;
  }
}

function writeStoredReport(report: OffSitePresenceReport | null): void {
  if (typeof window === 'undefined') return;
  if (!report) {
    sessionStorage.removeItem(REPORT_STORAGE_KEY);
    return;
  }
  sessionStorage.setItem(REPORT_STORAGE_KEY, JSON.stringify({ report }));
}

type PresenceProbeContextValue = {
  report: OffSitePresenceReport | null;
  resultError: string | null;
  failedError: string | null;
  isInterrupted: boolean;
  isRunning: boolean;
  jobId: string | null;
  job: ReturnType<typeof useAsyncJob<void, ProbeJobResult>>['job'];
  jobQuery: ReturnType<typeof useAsyncJob<void, ProbeJobResult>>['jobQuery'];
  progress: number;
  startProbe: () => void;
  resetProbe: () => void;
  cancelProbe: () => Promise<void>;
  clearReport: () => void;
  /** Load report from audit (does not start a probe job). */
  loadReport: (report: OffSitePresenceReport | null) => void;
};

const PresenceProbeContext = createContext<PresenceProbeContextValue | null>(null);

export function PresenceProbeProvider({ children }: { children: ReactNode }) {
  const {
    targetUrl,
    targetBrand,
    lastAuditId,
    lastAuditForUrl,
    siteKeywords,
    siteKeywordsReadyForUrl,
  } = useWorkspaceTarget();

  const [report, setReport] = useState<OffSitePresenceReport | null>(() => readStoredReport());
  const [resultError, setResultError] = useState<string | null>(null);
  const [failedError, setFailedError] = useState<string | null>(null);

  const applyReport = useCallback((next: OffSitePresenceReport | null) => {
    setReport(next);
    writeStoredReport(next);
    if (next) setResultError(null);
  }, []);

  const {
    mutate,
    reset,
    cancelJob,
    isRunning,
    isInterrupted,
    jobId,
    job,
    jobQuery,
    progress,
  } = useAsyncJob<void, ProbeJobResult>({
    queryKeyPrefix: 'presence-probe',
    pollIntervalMs: 2000,
    persistKey: JOB_STORAGE_KEY,
    background: BACKGROUND_JOB_UI.presence,
    clearJobOnComplete: false,
    clearJobOnFailed: true,
    mutationFn: async () => {
      const url = targetUrl.trim();
      if (!url) throw new Error('Enter your website in the bar above');
      let auditId: string | undefined;
      if (lastAuditId && lastAuditForUrl) {
        try {
          const normalized = normalizeWebsiteUrl(url.startsWith('http') ? url : `https://${url}`);
          if (normalized === lastAuditForUrl) auditId = lastAuditId;
        } catch {
          /* ignore */
        }
      }

      const siteKeywordsPayload =
        siteKeywords.length > 0 && siteKeywordsReadyForUrl(url) ? siteKeywords : undefined;

      return api.post<{ jobId: string }>('/api/off-site-presence', {
        siteUrl: url.startsWith('http') ? url : `https://${url}`,
        brandOverride: targetBrand.trim() || undefined,
        siteKeywords: siteKeywordsPayload,
        auditId,
        playwrightEnabled: true,
      });
    },
    onCompleted: (result) => {
      setFailedError(null);
      const next = extractProbeReport(result);
      if (next) applyReport(next);
    },
    onFailed: (error) => {
      if (error) setFailedError(error);
    },
  });

  /** Resume polling for a job restored from localStorage after navigation or refresh. */
  useEffect(() => {
    if (!jobId) return;
    if (job?.status !== 'completed') return;
    const next = extractProbeReport(job.result);
    if (next) {
      applyReport(next);
      return;
    }
    if (!jobQuery.isPending && !jobQuery.isFetching) {
      setResultError(
        'Probe finished but no report was returned. If you use BullMQ, run `npm run worker` in another terminal.',
      );
    }
  }, [job, jobId, jobQuery.isPending, jobQuery.isFetching, applyReport]);

  const startProbe = useCallback(() => {
    applyReport(null);
    setResultError(null);
    setFailedError(null);
    reset();
    mutate();
  }, [applyReport, reset, mutate]);

  const resetProbe = useCallback(() => {
    applyReport(null);
    setResultError(null);
    setFailedError(null);
    reset();
  }, [applyReport, reset]);

  const cancelProbe = useCallback(async () => {
    await cancelJob();
    setFailedError(null);
    setResultError(null);
    reset();
  }, [cancelJob, reset]);

  const clearReport = useCallback(() => {
    applyReport(null);
    setResultError(null);
  }, [applyReport]);

  const loadReport = useCallback(
    (next: OffSitePresenceReport | null) => {
      applyReport(next);
    },
    [applyReport],
  );

  const value = useMemo(
    () => ({
      report,
      resultError,
      failedError,
      isInterrupted: isInterrupted || isInterruptedJobError(failedError ?? undefined),
      isRunning,
      jobId,
      job,
      jobQuery,
      progress,
      startProbe,
      resetProbe,
      cancelProbe,
      clearReport,
      loadReport,
    }),
    [
      report,
      resultError,
      failedError,
      isInterrupted,
      isRunning,
      jobId,
      job,
      jobQuery,
      progress,
      startProbe,
      resetProbe,
      cancelProbe,
      clearReport,
      loadReport,
    ],
  );

  return (
    <PresenceProbeContext.Provider value={value}>{children}</PresenceProbeContext.Provider>
  );
}

export function usePresenceProbe(): PresenceProbeContextValue {
  const ctx = useContext(PresenceProbeContext);
  if (!ctx) {
    throw new Error('usePresenceProbe must be used within PresenceProbeProvider');
  }
  return ctx;
}

/** Safe for sidebar / global chrome — returns null outside provider. */
export function usePresenceProbeOptional(): PresenceProbeContextValue | null {
  return useContext(PresenceProbeContext);
}
