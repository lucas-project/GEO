'use client';

import { useState, useCallback, useRef } from 'react';
import { CheckCircle2, Loader2, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { JobProgress } from '@/components/geo/job-progress';
import { api } from '@/lib/api-client';
import { useAsyncJob } from '@/hooks/use-async-job';
import { writeBackgroundJobMeta } from '@/features/workspace/background-jobs-context';
import { BACKGROUND_JOB_KEYS, BACKGROUND_JOB_META_KEYS } from '@/lib/background-job-keys';
import { useBackgroundJobProgress } from '@/hooks/use-background-job-progress';
import { usePersistedJobCompletion } from '@/hooks/use-persisted-job-completion';
import {
  DEFAULT_QUESTION_TYPES,
  SimulationQuestionTypePicker,
  questionTypesToPayload,
  type SimulationQuestionTypesState,
} from './simulation-question-type-picker';

interface GenerateSimulationQuestionsProps {
  auditId: string;
  onCompleted?: (result: { prompts: number; competitors: number }) => void | Promise<void>;
  mode?: 'initial' | 'regenerate';
  className?: string;
  questionTypes?: SimulationQuestionTypesState;
  onQuestionTypesChange?: (value: SimulationQuestionTypesState) => void;
}

interface EnrichResult {
  prompts?: number;
  competitors?: number;
}

export function GenerateSimulationQuestions({
  auditId,
  onCompleted,
  mode = 'initial',
  className,
  questionTypes: questionTypesProp,
  onQuestionTypesChange,
}: GenerateSimulationQuestionsProps) {
  const [internalQuestionTypes, setInternalQuestionTypes] =
    useState<SimulationQuestionTypesState>(DEFAULT_QUESTION_TYPES);
  const questionTypes = questionTypesProp ?? internalQuestionTypes;

  const setQuestionTypes = (next: SimulationQuestionTypesState) => {
    if (questionTypesProp === undefined) {
      setInternalQuestionTypes(next);
    }
    onQuestionTypesChange?.(next);
  };
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ prompts: number } | null>(null);
  const completionHandledRef = useRef<string | null>(null);

  const persistKey = BACKGROUND_JOB_KEYS.simQuestions(auditId);
  const metaKey = BACKGROUND_JOB_META_KEYS.simQuestions(auditId);

  const applyCompletion = useCallback(
    async (result: EnrichResult, completedJobId?: string | null) => {
      const key = completedJobId ?? 'unknown';
      if (completionHandledRef.current === key) return;
      completionHandledRef.current = key;
      writeBackgroundJobMeta(metaKey, null);
      const prompts = result?.prompts ?? 0;
      if (prompts === 0) {
        setSuccess(null);
        setError('No questions were returned. Check AI_PROVIDER / rate limits and try again.');
        return;
      }
      setError(null);
      setSuccess({ prompts });
      await onCompleted?.({ prompts, competitors: result?.competitors ?? 0 });
    },
    [metaKey, onCompleted],
  );

  usePersistedJobCompletion<EnrichResult>(persistKey, (result, completedJobId) => {
    void applyCompletion(result, completedJobId);
  });

  const { mutate, isRunning, jobId, job, progress: hookProgress, cancelJob } = useAsyncJob<void, EnrichResult>({
    queryKeyPrefix: `enrich-suggestions-${auditId}`,
    pollIntervalMs: 1500,
    persistKey,
    background: {
      label: 'Generating simulation questions',
      viewHref: `/simulate?auditId=${auditId}`,
      hideOnPathPrefix: '/simulate',
      metaStorageKey: metaKey,
      etaUnits: 2,
    },
    clearJobOnComplete: true,
    clearJobOnFailed: true,
    mutationFn: async () => {
      writeBackgroundJobMeta(metaKey, { auditId, viewHref: `/simulate?auditId=${auditId}` });
      return api.post<{ jobId: string }>(`/api/geo-audit/${auditId}/enrich-suggestions`, {
        questionTypes: questionTypesToPayload(questionTypes),
      });
    },
    onCompleted: async (result, job) => {
      await applyCompletion(result ?? {}, job.id);
    },
    onFailed: (message) => {
      writeBackgroundJobMeta(metaKey, null);
      setSuccess(null);
      setError(message ?? 'Generation failed. Is the worker running?');
    },
  });

  const { progress: bgProgress, etaLabel } = useBackgroundJobProgress(persistKey);
  const progress = bgProgress ?? hookProgress;

  return (
    <div className={className}>
      <SimulationQuestionTypePicker
        value={questionTypes}
        onChange={setQuestionTypes}
        disabled={isRunning}
      />

      <div className="flex flex-wrap items-center justify-end gap-2 mt-3">
        <Button
          variant="secondary"
          size="sm"
          disabled={isRunning}
          onClick={() => {
            completionHandledRef.current = null;
            setError(null);
            setSuccess(null);
            mutate();
          }}
        >
          {isRunning ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Generating…
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4" />
              {mode === 'regenerate' ? 'Regenerate selected types' : 'Generate questions'}
            </>
          )}
        </Button>
      </div>

      {isRunning && (
        <JobProgress
          active
          jobId={jobId}
          status={job?.status}
          progress={progress}
          error={job?.error}
          label="Generating tailored simulation questions…"
          remainingLabel={etaLabel}
          remainingIsEstimate
          cancelLabel="Stop"
          onCancel={() => void cancelJob()}
          className="mt-3"
        />
      )}

      {success && !isRunning && (
        <p className="text-xs text-success flex items-start gap-1.5 mt-2">
          <CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          {success.prompts} question{success.prompts !== 1 ? 's' : ''} in the list (selected types
          only) — review, then run batch when ready.
        </p>
      )}

      {error && (
        <p className="text-xs text-danger leading-relaxed mt-2" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
