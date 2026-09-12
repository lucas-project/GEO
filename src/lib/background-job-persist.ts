import type { BackgroundJobUiOptions } from '@/hooks/use-async-job';
import {
  BACKGROUND_JOB_KEYS,
  BACKGROUND_JOB_META_KEYS,
} from '@/lib/background-job-keys';
import {
  auditExtendBackground,
  BACKGROUND_JOB_UI,
  simQuestionsBackground,
} from '@/lib/background-job-ui';

export const BACKGROUND_JOBS_CHANGED_EVENT = 'geo:background-jobs-changed';

/** Fired when a persisted background job finishes with a result (survives page unmount). */
export const BACKGROUND_JOB_COMPLETED_EVENT = 'geo:background-job-completed';

export type BackgroundJobCompletedDetail = {
  persistKey: string;
  jobId: string;
  result: unknown;
};

const PENDING_COMPLETION_PREFIX = 'geo:pending-job-completion:';
const PENDING_COMPLETION_TTL_MS = 30 * 60 * 1000;

export function notifyBackgroundJobCompleted(detail: BackgroundJobCompletedDetail): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(
      `${PENDING_COMPLETION_PREFIX}${detail.persistKey}`,
      JSON.stringify({ result: detail.result, jobId: detail.jobId, at: Date.now() }),
    );
  } catch {
    /* quota */
  }
  window.dispatchEvent(new CustomEvent(BACKGROUND_JOB_COMPLETED_EVENT, { detail }));
}

/** Read and clear a stashed completion (for remounting pages). */
export function takePendingJobCompletion<T>(
  persistKey: string,
): { result: T; jobId?: string } | null {
  if (typeof window === 'undefined') return null;
  const key = `${PENDING_COMPLETION_PREFIX}${persistKey}`;
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    sessionStorage.removeItem(key);
    const parsed = JSON.parse(raw) as { result?: T; jobId?: string; at?: number };
    if (!parsed.at || Date.now() - parsed.at > PENDING_COMPLETION_TTL_MS) return null;
    if (parsed.result == null) return null;
    return { result: parsed.result, jobId: parsed.jobId };
  } catch {
    return null;
  }
}

const UI_CONFIG_PREFIX = 'geo:job-ui:';

export type PersistedJobUiConfig = BackgroundJobUiOptions & {
  clearOnComplete?: boolean;
  clearOnFailed?: boolean;
};

const STATIC_JOBS: Record<string, PersistedJobUiConfig> = {
  [BACKGROUND_JOB_KEYS.audit]: { ...BACKGROUND_JOB_UI.audit, clearOnComplete: true },
  [BACKGROUND_JOB_KEYS.content]: {
    ...BACKGROUND_JOB_UI.content,
    clearOnComplete: false,
    clearOnFailed: true,
  },
  [BACKGROUND_JOB_KEYS.presence]: {
    ...BACKGROUND_JOB_UI.presence,
    clearOnComplete: false,
    clearOnFailed: true,
  },
  [BACKGROUND_JOB_KEYS.simBatch]: {
    ...BACKGROUND_JOB_UI.simBatch,
    metaStorageKey: BACKGROUND_JOB_META_KEYS.simBatch,
    clearOnComplete: true,
  },
  [BACKGROUND_JOB_KEYS.simSingle]: { ...BACKGROUND_JOB_UI.simSingle, clearOnComplete: true },
  [BACKGROUND_JOB_KEYS.competitor]: { ...BACKGROUND_JOB_UI.competitor, clearOnComplete: true },
  [BACKGROUND_JOB_KEYS.monitorRun]: {
    ...BACKGROUND_JOB_UI.monitorRun,
    metaStorageKey: BACKGROUND_JOB_META_KEYS.monitorRun,
    clearOnComplete: true,
  },
};

export function notifyBackgroundJobsChanged(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(BACKGROUND_JOBS_CHANGED_EVENT));
}

export function writeJobUiConfig(persistKey: string, config: BackgroundJobUiOptions): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(`${UI_CONFIG_PREFIX}${persistKey}`, JSON.stringify(config));
  notifyBackgroundJobsChanged();
}

export function readJobUiConfig(persistKey: string): BackgroundJobUiOptions | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(`${UI_CONFIG_PREFIX}${persistKey}`);
    if (!raw) return null;
    return JSON.parse(raw) as BackgroundJobUiOptions;
  } catch {
    return null;
  }
}

export function clearJobUiConfig(persistKey: string): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(`${UI_CONFIG_PREFIX}${persistKey}`);
}

function isJobPersistKey(key: string): boolean {
  if (!key.startsWith('geo:')) return false;
  if (
    key.includes('-meta') ||
    key.startsWith('geo:job-ui:') ||
    key.startsWith('geo:sim-batch-items:') ||
    key.startsWith('geo:audit-job-url') ||
    key === 'geo:audit-discovery' ||
    key === 'geo:audit-pending-report' ||
    key.startsWith('geo:content-result') ||
    key.startsWith('geo:presence-probe-report')
  ) {
    return false;
  }
  return key.includes('-job') || key.startsWith('geo:audit-extend:');
}

/** All localStorage keys that currently hold a persisted job id. */
export function listPersistedJobKeys(): string[] {
  if (typeof window === 'undefined') return [];
  const keys: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key || !isJobPersistKey(key)) continue;
    if (localStorage.getItem(key)) keys.push(key);
  }
  return keys;
}

export function resolveBackgroundJobUi(persistKey: string): PersistedJobUiConfig | null {
  const stored = readJobUiConfig(persistKey);
  if (STATIC_JOBS[persistKey]) {
    return { ...STATIC_JOBS[persistKey], ...stored };
  }

  const extendPrefix = 'geo:audit-extend:';
  if (persistKey.startsWith(extendPrefix)) {
    const auditId = persistKey.slice(extendPrefix.length);
    return {
      ...auditExtendBackground(auditId),
      metaStorageKey: BACKGROUND_JOB_META_KEYS.auditExtend(auditId),
      clearOnComplete: true,
      ...stored,
    };
  }

  const questionsPrefix = 'geo:sim-questions-job:';
  if (persistKey.startsWith(questionsPrefix)) {
    const auditId = persistKey.slice(questionsPrefix.length);
    const metaKey = BACKGROUND_JOB_META_KEYS.simQuestions(auditId);
    return {
      ...simQuestionsBackground(auditId, metaKey),
      clearOnComplete: true,
      ...stored,
    };
  }

  if (stored) {
    return { clearOnComplete: true, clearOnFailed: true, ...stored };
  }

  return null;
}

export function shouldClearPersistedJob(
  config: PersistedJobUiConfig,
  status: string,
): boolean {
  if (status === 'failed' || status === 'cancelled') {
    return config.clearOnFailed !== false;
  }
  if (status === 'completed') {
    return config.clearOnComplete !== false;
  }
  return false;
}

export function clearPersistedJob(persistKey: string): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(persistKey);
  clearJobUiConfig(persistKey);
  notifyBackgroundJobsChanged();
}

export function resolveViewHref(
  ui: BackgroundJobUiOptions,
  meta: Record<string, unknown> | null,
): string | undefined {
  if (meta && typeof meta.viewHref === 'string') return meta.viewHref;
  if (meta && typeof meta.auditId === 'string') {
    return `/simulate?batch=1&auditId=${meta.auditId}`;
  }
  return ui.viewHref;
}
