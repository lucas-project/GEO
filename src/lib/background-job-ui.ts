import type { BackgroundJobUiOptions } from '@/hooks/use-async-job';

/** Stable background UI configs — do not inline in components (avoids needless object identity churn). */
export const BACKGROUND_JOB_UI = {
  audit: {
    label: 'GEO audit running',
    viewHref: '/audit',
    hideOnPathPrefix: '/audit',
    etaUnits: 3,
  },
  content: {
    label: 'Generating content ideas',
    viewHref: '/geo-content',
    hideOnPathPrefix: '/geo-content',
    etaUnits: 2,
  },
  presence: {
    label: 'Presence scan running',
    viewHref: '/presence',
    hideOnPathPrefix: '/presence',
    etaUnits: 4,
  },
  simBatch: {
    label: 'Batch simulation running',
    viewHref: '/simulate',
    hideOnPathPrefix: '/simulate',
  },
  simSingle: {
    label: 'Running simulation',
    viewHref: '/simulate',
    hideOnPathPrefix: '/simulate',
  },
  competitor: {
    label: 'Competitor comparison running',
    viewHref: '/competitors',
    hideOnPathPrefix: '/competitors',
    etaUnits: 3,
  },
  monitorRun: {
    label: 'Monitor check running',
    viewHref: '/monitor',
    hideOnPathPrefix: '/monitor',
    etaUnits: 3,
  },
} as const satisfies Record<string, BackgroundJobUiOptions>;

export function auditExtendBackground(auditId: string): BackgroundJobUiOptions {
  return {
    label: 'Adding pages to audit',
    viewHref: `/audit/${auditId}`,
    hideOnPathPrefix: `/audit/${auditId}`,
    etaUnits: 2,
  };
}

export function simQuestionsBackground(auditId: string, metaStorageKey: string): BackgroundJobUiOptions {
  return {
    label: 'Generating simulation questions',
    viewHref: `/simulate?auditId=${auditId}`,
    hideOnPathPrefix: '/simulate',
    metaStorageKey,
    etaUnits: 2,
  };
}
