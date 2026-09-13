'use client';

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Sparkles, Loader2, ChevronDown, ChevronRight, ListChecks } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Input, Textarea } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { JobProgress } from '@/components/geo/job-progress';
import { api } from '@/lib/api-client';
import { AuditFirstGate } from '@/features/workspace/audit-first-gate';
import { useWorkspaceTarget } from '@/features/workspace/workspace-target-context';
import { SiteKeywordChips } from '@/features/workspace/site-keyword-chips';
import { useSimulationBatchJob } from '@/features/simulate/simulation-batch-job-context';
import type { GeoAuditResult } from '@modules/geo-audit';
import { normalizeSimulationPrompts } from '@modules/geo-audit';
import { applySimulationKeywords } from './apply-simulation-keywords';
import { GenerateSimulationQuestions } from './generate-simulation-questions';
import {
  DEFAULT_QUESTION_TYPES,
  type SimulationQuestionTypesState,
} from './simulation-question-type-picker';
import {
  SimulationPromptList,
  promptsFromSuggestions,
  type SimulationPromptItem,
} from './simulation-prompt-list';
import { SimulationHowItWorks } from './simulation-how-it-works';
import { SimulateCollapsibleSection } from './simulate-collapsible-section';
import {
  platformLabelsFromConfig,
  resolvePlatformLabel,
  useSimulationPlatformConfig,
} from './use-simulation-platform-config';
import { VisibilityCheckResults } from '@/components/geo/visibility-check-results';
import { formatDate } from '@/lib/utils';
import {
  readStoredSimBatchState,
  writeStoredSimBatchState,
} from './sim-batch-items-storage';
import { listVisibilityRuns } from './simulation-visibility-runs';
import { SimulationRunHistoryPicker } from './simulation-run-history-picker';

async function refreshBatchFromAudit(
  auditId: string,
  brandName: string | undefined,
): Promise<SimulationPromptItem[]> {
  const { audit } = await api.get<{ audit: GeoAuditResult }>(`/api/geo-audit/${auditId}`);
  const raw = audit?.scoringMeta?.suggestedSimulationPrompts ?? [];
  return promptsFromSuggestions(normalizeSimulationPrompts(raw, brandName));
}

function filterPromptItemsByTypes(
  items: SimulationPromptItem[],
  types: SimulationQuestionTypesState,
): SimulationPromptItem[] {
  return items.filter((item) => !item.type || types[item.type]);
}

interface SimulationRunData {
  id: string;
  platform: string;
  responseText: string;
  model?: string;
  provider?: string;
  executionMode?: 'mock' | 'local' | 'persona' | 'live' | 'mixed' | 'legacy_unknown';
  citations: Array<{ url: string | null; brand: string | null; domain: string | null; position: number }>;
  brandMentions: Array<{ brand: string; count: number }>;
}

interface SimulationResultData {
  runId: string;
  prompt: string;
  runs: SimulationRunData[];
  executionMode?: 'mock' | 'local' | 'persona' | 'live' | 'mixed' | 'legacy_unknown';
  retrievalEnabled?: boolean;
  aggregate: {
    totalCitations: number;
    brandLeaderboard: Array<{ brand: string; count: number }>;
    domainLeaderboard: Array<{ domain: string; count: number }>;
    targetVisibility: { brand: string; mentionedOnPlatforms: string[]; visibilityScore: number } | null;
  };
}


export function SimulationRunner() {
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const {
    targetUrl,
    targetBrand,
    setTargetBrand,
    lastAuditId,
    siteKeywords,
    siteKeywordSuggestions,
    siteKeywordsLoading,
    siteKeywordsError,
    toggleSiteKeyword,
    refreshSiteKeywords,
  } = useWorkspaceTarget();
  const [prompt, setPrompt] = useState('');
  const [extraKeywords, setExtraKeywords] = useState('');
  const [batchItems, setBatchItems] = useState<SimulationPromptItem[]>([]);
  const [batchItemsAuditId, setBatchItemsAuditId] = useState<string | null>(null);
  const [questionTypes, setQuestionTypes] = useState<SimulationQuestionTypesState>(
    DEFAULT_QUESTION_TYPES,
  );
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [scrollToBatchAfterGenerate, setScrollToBatchAfterGenerate] = useState(false);
  const [visibilitySectionOpen, setVisibilitySectionOpen] = useState(false);
  const [selectedCheckedAt, setSelectedCheckedAt] = useState<string | null>(null);
  const batchSectionRef = useRef<HTMLDivElement>(null);
  const appliedAuditPromptsKeyRef = useRef<string | null>(null);

  const {
    isRunning: batchRunning,
    job: batchJob,
    jobId: batchJobId,
    progress: batchProgress,
    etaLabel,
    completeSummary: batchCompleteSummary,
    visibilityOverride: batchVisibilityOverride,
    clearCompleteSummary,
    setVisibilityOverride,
    startBatch: startBatchJob,
    cancelBatch,
    isSingleRunning,
    singleRunId,
    setSingleRunId,
    startSingle,
  } = useSimulationBatchJob();

  const batchRequested = searchParams.get('batch') === '1';
  const batchAuditId = searchParams.get('auditId')?.trim() || lastAuditId || null;

  const focusKeywords = useMemo(() => {
    const extra = extraKeywords
      .split(/[,;]+/)
      .map((k) => k.trim())
      .filter(Boolean);
    const merged = [...siteKeywords, ...extra];
    return [...new Set(merged.map((k) => k.toLowerCase()))].map(
      (lower) => merged.find((k) => k.toLowerCase() === lower) ?? lower,
    );
  }, [siteKeywords, extraKeywords]);

  const buildPrompt = useCallback(
    (base: string) => applySimulationKeywords(base, focusKeywords),
    [focusKeywords],
  );

  useEffect(() => {
    const fromQuery = searchParams.get('prompt')?.trim();
    if (fromQuery && !prompt) setPrompt(fromQuery);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { data: auditData } = useQuery<{ audit: GeoAuditResult }>({
    queryKey: ['sim-audit-suggestions', batchAuditId ?? lastAuditId],
    enabled: Boolean(batchAuditId ?? lastAuditId),
    queryFn: () => api.get(`/api/geo-audit/${batchAuditId ?? lastAuditId}`),
    staleTime: 0,
  });

  const brandName = targetBrand.trim() || undefined;
  const normalizedSuggestions = useMemo(
    () =>
      normalizeSimulationPrompts(
        auditData?.audit?.scoringMeta?.suggestedSimulationPrompts ?? [],
        brandName,
      ),
    [auditData?.audit?.scoringMeta?.suggestedSimulationPrompts, brandName],
  );
  const suggestedPrompts = useMemo(
    () => normalizedSuggestions.map((e) => e.prompt),
    [normalizedSuggestions],
  );
  const latestVisibilityCheck =
    batchVisibilityOverride ?? auditData?.audit?.scoringMeta?.simulationVisibilityCheck;
  const allVisibilityRuns = useMemo(
    () =>
      listVisibilityRuns(
        latestVisibilityCheck,
        auditData?.audit?.scoringMeta?.simulationVisibilityHistory ?? [],
      ),
    [latestVisibilityCheck, auditData?.audit?.scoringMeta?.simulationVisibilityHistory],
  );
  const displayVisibilityCheck = useMemo(() => {
    if (allVisibilityRuns.length === 0) return null;
    if (selectedCheckedAt) {
      return (
        allVisibilityRuns.find((run) => run.checkedAt === selectedCheckedAt) ??
        allVisibilityRuns[0] ??
        null
      );
    }
    return allVisibilityRuns[0] ?? null;
  }, [allVisibilityRuns, selectedCheckedAt]);
  const hasPastRuns = allVisibilityRuns.length > 0;
  const auditIdForGenerate = batchAuditId ?? lastAuditId;
  const { data: simPlatformConfig } = useSimulationPlatformConfig();
  const platformLabels = useMemo(
    () => platformLabelsFromConfig(simPlatformConfig),
    [simPlatformConfig],
  );

  const syncBatchFromAudit = useCallback(
    async (auditId: string) => {
      const items = filterPromptItemsByTypes(
        await refreshBatchFromAudit(auditId, brandName),
        questionTypes,
      );
      setBatchItems(items);
      setBatchItemsAuditId(auditId);
      appliedAuditPromptsKeyRef.current = items
        .map((s) => `${s.type ?? ''}\0${s.text}`)
        .join('\n');
      void queryClient.invalidateQueries({ queryKey: ['sim-audit-suggestions', auditId] });
      void queryClient.invalidateQueries({ queryKey: ['geo-audit', auditId] });
      return items.length;
    },
    [brandName, queryClient, questionTypes],
  );

  const handleQuestionTypesChange = useCallback((types: SimulationQuestionTypesState) => {
    setQuestionTypes(types);
    setBatchItems((prev) => filterPromptItemsByTypes(prev, types));
  }, []);

  const handleQuestionsGenerated = useCallback(
    async (auditId: string) => {
      const count = await syncBatchFromAudit(auditId);
      if (count > 0) setScrollToBatchAfterGenerate(true);
    },
    [syncBatchFromAudit],
  );

  useEffect(() => {
    const auditKey = batchAuditId ?? lastAuditId;
    if (!auditKey || normalizedSuggestions.length === 0) return;

    const auditChanged = batchItemsAuditId !== auditKey;
    if (!auditChanged) return;

    const stored = readStoredSimBatchState(auditKey);
    if (stored) {
      setBatchItems(stored.items);
      setQuestionTypes(stored.questionTypes);
      setBatchItemsAuditId(auditKey);
      appliedAuditPromptsKeyRef.current = stored.items
        .map((s) => `${s.type ?? ''}\0${s.text}`)
        .join('\n');
      return;
    }

    const items = filterPromptItemsByTypes(
      promptsFromSuggestions(normalizedSuggestions),
      questionTypes,
    );
    setBatchItems(items);
    setBatchItemsAuditId(auditKey);
    appliedAuditPromptsKeyRef.current = items
      .map((s) => `${s.type ?? ''}\0${s.text}`)
      .join('\n');
  }, [
    batchAuditId,
    lastAuditId,
    batchItemsAuditId,
    normalizedSuggestions,
    questionTypes,
  ]);

  useEffect(() => {
    if (!batchItemsAuditId || batchItems.length === 0) return;
    writeStoredSimBatchState(batchItemsAuditId, { items: batchItems, questionTypes });
  }, [batchItems, batchItemsAuditId, questionTypes]);

  useEffect(() => {
    if (batchRequested && suggestedPrompts.length > 0 && batchSectionRef.current) {
      batchSectionRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [batchRequested, suggestedPrompts.length]);

  useEffect(() => {
    if (!scrollToBatchAfterGenerate || batchItems.length === 0) return;
    batchSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setScrollToBatchAfterGenerate(false);
  }, [scrollToBatchAfterGenerate, batchItems.length]);

  const enabledBatchEntries = useMemo(
    () =>
      batchItems
        .filter((item) => item.enabled && item.text.trim().length >= 3)
        .map((item) => {
          const type =
            item.type ??
            (brandName && item.text.toLowerCase().includes(brandName.toLowerCase())
              ? ('brand' as const)
              : ('discovery' as const));
          return {
            text: type === 'discovery' ? item.text.trim() : buildPrompt(item.text),
            type,
          };
        }),
    [batchItems, buildPrompt, brandName],
  );

  const enabledBatchPrompts = useMemo(
    () => enabledBatchEntries.map((e) => e.text),
    [enabledBatchEntries],
  );

  useEffect(() => {
    if (!batchCompleteSummary || batchRunning) return;
    setSelectedCheckedAt(null);
    setVisibilitySectionOpen(true);
    requestAnimationFrame(() => {
      document.getElementById('sim-visibility-results')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
  }, [batchCompleteSummary, batchRunning]);

  useEffect(() => {
    if (singleRunId) setActiveRunId(singleRunId);
  }, [singleRunId]);

  const startSimulation = () => {
    setActiveRunId(null);
    setSingleRunId(null);
    queryClient.removeQueries({ queryKey: ['sim-result'] });
    startSingle({
      prompt: buildPrompt(prompt),
      targetBrand: targetBrand.trim() || undefined,
      targetUrl: targetUrl.trim() || undefined,
      contextAuditId: lastAuditId ?? undefined,
    });
  };

  const isRunning = isSingleRunning;

  const startBatch = () => {
    if (!batchAuditId) return;
    if (enabledBatchPrompts.length === 0) return;
    clearCompleteSummary();
    startBatchJob({
      prompts: enabledBatchEntries,
      targetBrand: targetBrand.trim() || undefined,
      targetUrl: targetUrl.trim() || undefined,
      contextAuditId: batchAuditId,
      auditId: batchAuditId,
    });
  };

  const anyRunning = isRunning || batchRunning;

  const { data: result, isFetching: resultLoading } = useQuery<{ result: SimulationResultData }>({
    queryKey: ['sim-result', activeRunId],
    enabled: Boolean(activeRunId),
    queryFn: () => api.get(`/api/simulate-ai-search?runId=${activeRunId}`),
    staleTime: 0,
  });

  const isStaleMockRun =
    result?.result?.runs?.[0]?.responseText?.includes('Schema.org markup and FAQ blocks') ?? false;

  const previewPrompt = prompt.trim() ? buildPrompt(prompt) : '';
  const promptDiffersFromPreview = previewPrompt !== prompt.trim() && prompt.trim().length > 0;

  const promptCount = useMemo(
    () => normalizedSuggestions.filter((entry) => questionTypes[entry.type]).length,
    [normalizedSuggestions, questionTypes],
  );
  const hasBatch = batchItems.length > 0 && Boolean(batchAuditId);

  return (
    <AuditFirstGate featureName="the AI visibility test">
    <div className="space-y-3">
      <SimulationHowItWorks />

      {hasBatch && (
        <div ref={batchSectionRef}>
          <SimulateCollapsibleSection
            id="batch-section"
            title="Batch test"
            defaultOpen
            badge={
              <Badge variant="outline" className="text-[10px] h-5 px-1.5">
                {enabledBatchEntries.filter((e) => e.type !== 'brand').length} discovery ·{' '}
                {enabledBatchEntries.filter((e) => e.type === 'brand').length} brand
              </Badge>
            }
            summary={`${batchItems.length} questions · saved locally · rerun anytime`}
          >
            {auditIdForGenerate && (
              <SimulateCollapsibleSection
                title="Generate questions"
                defaultOpen={promptCount === 0}
                summary={
                  promptCount > 0
                    ? `${promptCount} saved for selected types`
                    : 'From your audit'
                }
                className="mb-3 border-dashed"
              >
                <GenerateSimulationQuestions
                  auditId={auditIdForGenerate}
                  mode={promptCount > 0 ? 'regenerate' : 'initial'}
                  questionTypes={questionTypes}
                  onQuestionTypesChange={handleQuestionTypesChange}
                  onCompleted={() => handleQuestionsGenerated(auditIdForGenerate)}
                />
              </SimulateCollapsibleSection>
            )}

            <SimulationPromptList
              items={batchItems}
              onChange={setBatchItems}
              disabled={anyRunning}
            />

            <div className="flex flex-wrap justify-end gap-2 pt-2 mt-2 border-t border-border-subtle">
              <Button
                variant="secondary"
                size="sm"
                disabled={anyRunning || enabledBatchPrompts.length === 0}
                onClick={startBatch}
              >
                {batchRunning ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Testing {enabledBatchPrompts.length}…
                  </>
                ) : (
                  <>
                    <ListChecks className="w-4 h-4" />
                    {hasPastRuns
                      ? `Rerun batch (${enabledBatchPrompts.length})`
                      : `Run batch (${enabledBatchPrompts.length})`}
                  </>
                )}
              </Button>
            </div>
            {batchRequested && (
              <p className="text-[11px] text-accent mt-2">Review the list, then run batch when ready.</p>
            )}
          </SimulateCollapsibleSection>
        </div>
      )}

      {!hasBatch && auditIdForGenerate && (
        <SimulateCollapsibleSection
          title="Generate questions"
          defaultOpen
          summary="Create audit-suggested questions first"
        >
          <GenerateSimulationQuestions
            auditId={auditIdForGenerate}
            mode="initial"
            questionTypes={questionTypes}
            onQuestionTypesChange={handleQuestionTypesChange}
            onCompleted={() => handleQuestionsGenerated(auditIdForGenerate)}
          />
        </SimulateCollapsibleSection>
      )}

      <SimulateCollapsibleSection
        title="Quick single test"
        defaultOpen={!hasBatch}
        summary={prompt.trim() ? 'Question ready' : 'One-off prompt'}
      >
        <div className="space-y-2 pt-2">
          <Textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder={
              suggestedPrompts.length > 0
                ? 'Type or pick a suggestion below…'
                : 'Best AI SEO tools 2026'
            }
            disabled={anyRunning}
            rows={2}
            className="text-sm"
          />

          {normalizedSuggestions.length > 0 && (
            <details className="text-xs">
              <summary className="cursor-pointer text-fg-muted hover:text-fg py-1">
                {normalizedSuggestions.length} suggestions — click to browse
              </summary>
              <div className="flex flex-wrap gap-1 pt-1 max-h-32 overflow-y-auto">
                {normalizedSuggestions.map((entry) => (
                  <button
                    key={entry.prompt}
                    type="button"
                    onClick={() => setPrompt(entry.prompt)}
                    disabled={anyRunning}
                    className={`text-[11px] px-1.5 py-0.5 rounded border transition-colors text-left ${
                      prompt === entry.prompt
                        ? 'border-accent bg-accent/10 text-accent'
                        : 'border-border-subtle text-fg-muted hover:text-fg'
                    }`}
                  >
                    <span className="opacity-60 mr-0.5">
                      {entry.type === 'brand' ? 'B' : 'D'}:
                    </span>
                    {entry.prompt.length > 72 ? `${entry.prompt.slice(0, 72)}…` : entry.prompt}
                  </button>
                ))}
              </div>
            </details>
          )}

          <details className="rounded-md border border-border-subtle/80 bg-bg-muted/20">
            <summary className="cursor-pointer text-[11px] text-fg-muted px-2 py-1.5">
              Focus keywords & target brand
            </summary>
            <div className="px-2 pb-2 space-y-2 border-t border-border-subtle/60">
              {(siteKeywordSuggestions.length > 0 || siteKeywordsLoading) && (
                <SiteKeywordChips
                  keywords={siteKeywordSuggestions.length > 0 ? siteKeywordSuggestions : siteKeywords}
                  selectedTerms={siteKeywords}
                  loading={siteKeywordsLoading}
                  error={siteKeywordsError}
                  onToggle={toggleSiteKeyword}
                  onRefresh={refreshSiteKeywords}
                />
              )}
              <Input
                value={extraKeywords}
                onChange={(e) => setExtraKeywords(e.target.value)}
                placeholder="Extra keywords: split system, heat pump…"
                disabled={anyRunning}
                className="h-8 text-xs"
              />
              <Input
                value={targetBrand}
                onChange={(e) => setTargetBrand(e.target.value)}
                placeholder="Target brand (optional)"
                disabled={anyRunning}
                className="h-8 text-xs"
              />
              {promptDiffersFromPreview && (
                <p className="text-[10px] text-fg-subtle">
                  <span className="text-fg-muted">Sent: </span>
                  {previewPrompt.length > 120 ? `${previewPrompt.slice(0, 120)}…` : previewPrompt}
                </p>
              )}
            </div>
          </details>

          <div className="flex justify-end">
            <Button size="sm" disabled={!prompt.trim() || anyRunning} onClick={startSimulation}>
              {isRunning ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Running…
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  Run one question
                </>
              )}
            </Button>
          </div>
        </div>
      </SimulateCollapsibleSection>

      {batchRunning && (
        <JobProgress
          active
          forceShow={!batchJobId}
          jobId={batchJobId}
          status={batchJob?.status ?? 'pending'}
          progress={batchProgress}
          statusMessage={
            batchJob?.statusMessage ??
            (batchJob?.status === 'pending'
              ? 'Waiting in queue…'
              : batchJobId
                ? undefined
                : 'Starting batch…')
          }
          error={batchJob?.error}
          label="Testing selected questions…"
          remainingLabel={etaLabel}
          remainingIsEstimate
          cancelLabel="Stop"
          onCancel={() => void cancelBatch()}
        />
      )}

      {batchJob?.status === 'failed' && batchJob.error && (
        <p className="text-xs text-danger rounded-lg border border-danger/30 bg-danger/5 px-3 py-2">
          Batch test failed: {batchJob.error}
        </p>
      )}

      {batchCompleteSummary && !batchRunning && (
        <p className="text-xs text-success rounded-lg border border-success/30 bg-success/5 px-3 py-2">
          Batch complete — {batchCompleteSummary.promptsCiting} of {batchCompleteSummary.promptsTested}{' '}
          discovery questions cited your brand
          {displayVisibilityCheck?.checkedAt ? ` · ${formatDate(displayVisibilityCheck.checkedAt)}` : ''}.
        </p>
      )}

      {batchCompleteSummary && !batchRunning && !displayVisibilityCheck && (
        <p className="text-xs text-amber-600/90 dark:text-amber-400/90 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2">
          Batch finished ({batchCompleteSummary.promptsCiting}/{batchCompleteSummary.promptsTested} citing) but
          detailed results did not load — refresh the page or open the audit report.
        </p>
      )}

      {hasPastRuns && !batchRunning && (
        <SimulateCollapsibleSection
          key={displayVisibilityCheck?.checkedAt ?? 'visibility'}
          id="sim-visibility-results"
          title="Visibility check results"
          defaultOpen={visibilitySectionOpen || Boolean(batchCompleteSummary)}
          badge={
            displayVisibilityCheck && (
              <Badge variant="outline" className="text-[10px] h-5 px-1.5">
                {displayVisibilityCheck.promptsCiting}/{displayVisibilityCheck.promptsTested} discovery
              </Badge>
            )
          }
          summary={
            displayVisibilityCheck
              ? `${formatDate(displayVisibilityCheck.checkedAt)} · avg ${displayVisibilityCheck.averageVisibilityScore}/100${allVisibilityRuns.length > 1 ? ` · ${allVisibilityRuns.length} runs saved` : ''}`
              : 'Batch history'
          }
        >
          <div className="pt-2 space-y-2">
            <SimulationRunHistoryPicker
              runs={allVisibilityRuns}
              selectedCheckedAt={selectedCheckedAt}
              onSelect={setSelectedCheckedAt}
            />
            <p className="text-[11px] text-fg-muted">
              Discovery questions are sent as plain shopper queries — no brand name, no site excerpts, no
              focus-keyword suffix. We only check afterward whether your brand appeared. Your question list
              is kept on this device so you can rerun the same batch anytime.
            </p>
            {displayVisibilityCheck && (
              <VisibilityCheckResults
                check={displayVisibilityCheck}
                auditId={batchAuditId}
                onCheckUpdated={(check) => {
                  if (selectedCheckedAt == null) setVisibilityOverride(check);
                }}
                activeRunId={activeRunId}
                onSelectRun={(runId) => {
                  setActiveRunId(runId);
                  void queryClient.invalidateQueries({ queryKey: ['sim-result', runId] });
                  requestAnimationFrame(() => {
                    document.getElementById('sim-run-detail')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                  });
                }}
                platformLabels={platformLabels}
                localMultiModel={simPlatformConfig?.localMultiModel}
              />
            )}
            {batchAuditId && (
              <Link
                href={`/audit/${batchAuditId}`}
                className="inline-flex text-[11px] text-accent hover:underline"
              >
                View on audit report →
              </Link>
            )}
          </div>
        </SimulateCollapsibleSection>
      )}

      {isRunning && !result?.result && !batchRunning && (
        <p className="text-xs text-fg-muted text-center py-2">Running simulation…</p>
      )}

      {isStaleMockRun && (
        <p className="text-xs text-amber-600/90 dark:text-amber-400/90 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2">
          Stale mock format — run again to refresh.
        </p>
      )}

      {activeRunId && resultLoading && !batchRunning && (
        <p className="text-xs text-fg-muted text-center py-2 flex items-center justify-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" />
          Loading full run…
        </p>
      )}

      {(result?.result || activeRunId) && !batchRunning && (
        <div id="sim-run-detail">
          {result?.result && !resultLoading && (
            <SimulationResultView
              result={result.result}
              runId={activeRunId}
              platformLabels={platformLabels}
              localMultiModel={simPlatformConfig?.localMultiModel}
            />
          )}
        </div>
      )}
    </div>
    </AuditFirstGate>
  );
}

function SimulationResultView({
  result,
  runId,
  platformLabels,
  localMultiModel,
}: {
  result: SimulationResultData;
  runId: string | null;
  platformLabels: Record<string, string>;
  localMultiModel?: boolean;
}) {
  const isLiveObservation = result.executionMode === 'live' && !result.retrievalEnabled;
  return (
    <>
      {runId && <p className="text-[12px] text-fg-subtle font-mono mb-1">Run {runId}</p>}
      {!isLiveObservation && (
        <p className="mb-3 rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
          {result.executionMode === 'legacy_unknown'
            ? 'This historical run has no recorded execution mode; it is not evidence of external AI-platform visibility.'
            : `${result.executionMode ?? 'unknown'} experiment${result.retrievalEnabled ? ' with audited-site retrieval context' : ''}. It tests this model setup, not production visibility on named AI platforms.`}
        </p>
      )}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Brand leaderboard</CardTitle>
            <p className="text-[11px] text-fg-muted font-normal mt-0.5">
              For this single question only — batch market landscape uses discovery questions
            </p>
          </CardHeader>
          <CardContent>
            {result.aggregate.brandLeaderboard.length === 0 ? (
              <p className="text-xs text-fg-muted">No brand mentions detected.</p>
            ) : (
              <ul className="space-y-2">
                {result.aggregate.brandLeaderboard.map((b, i) => (
                  <li key={b.brand} className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2">
                      <span className="text-fg-subtle tabular-nums w-5 text-xs">{i + 1}.</span>
                      <span className="text-fg">{b.brand}</span>
                    </span>
                    <Badge variant="accent">{b.count}×</Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Cited domains</CardTitle>
          </CardHeader>
          <CardContent>
            {result.aggregate.domainLeaderboard.length === 0 ? (
              <p className="text-xs text-fg-muted">No URLs cited.</p>
            ) : (
              <ul className="space-y-2">
                {result.aggregate.domainLeaderboard.map((d, i) => (
                  <li key={d.domain} className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2">
                      <span className="text-fg-subtle tabular-nums w-5 text-xs">{i + 1}.</span>
                      <span className="text-fg font-mono">{d.domain}</span>
                    </span>
                    <Badge>{d.count}×</Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Aggregate</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <Stat label="Total citations" value={String(result.aggregate.totalCitations)} />
            <Stat
              label={localMultiModel ? 'Models queried' : 'Platforms queried'}
              value={String(result.runs.length)}
            />
            {result.aggregate.targetVisibility && (
              <div className="pt-3 border-t border-border-subtle">
                <div className="text-fg-subtle uppercase tracking-wider text-[12px] mb-1">
                  Target visibility — {result.aggregate.targetVisibility.brand}
                </div>
                <div className="text-3xl font-semibold tabular-nums">
                  {result.aggregate.targetVisibility.visibilityScore}
                  <span className="text-base text-fg-muted">/100</span>
                </div>
                <div className="text-[13px] text-fg-muted mt-1">
                  Cited on {result.aggregate.targetVisibility.mentionedOnPlatforms.length} of 4{' '}
                  {localMultiModel ? 'models' : 'platforms'}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{localMultiModel ? 'Per-model responses' : 'Per-platform responses'}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {result.runs.map((r) => (
            <PlatformResponseRow key={r.id} run={r} platformLabels={platformLabels} />
          ))}
        </CardContent>
      </Card>
    </>
  );
}

function PlatformResponseRow({
  run,
  platformLabels,
}: {
  run: SimulationRunData;
  platformLabels: Record<string, string>;
}) {
  const [open, setOpen] = useState(false);
  const label = resolvePlatformLabel(
    run.platform as 'chatgpt' | 'gemini' | 'claude' | 'perplexity',
    platformLabels as Record<'chatgpt' | 'gemini' | 'claude' | 'perplexity', string>,
    run,
  );
  return (
    <div className="rounded-lg border border-border bg-bg-elevated">
      <button
        type="button"
        className="w-full p-3 flex items-center gap-3 hover:bg-bg-muted/40 transition-colors text-left"
        onClick={() => setOpen((o) => !o)}
      >
        {open ? <ChevronDown className="w-4 h-4 text-fg-subtle" /> : <ChevronRight className="w-4 h-4 text-fg-subtle" />}
        <span className="text-sm font-medium text-fg font-mono min-w-0 truncate max-w-[40%]" title={label}>
          {label}
        </span>
        <Badge variant="accent">{run.citations.length} citations</Badge>
        {run.provider && run.provider !== 'recomputed' && run.provider !== 'ollama' && (
          <span className="text-[10px] font-mono text-fg-subtle hidden sm:inline">
            {run.provider}{run.model ? ` · ${run.model}` : ''}
          </span>
        )}
        <span className="text-xs text-fg-muted truncate flex-1">{run.responseText.slice(0, 120)}</span>
      </button>
      {open && (
        <div className="border-t border-border-subtle p-3 space-y-3">
          <p className="text-sm text-fg whitespace-pre-wrap leading-relaxed">{run.responseText}</p>
          {run.brandMentions.length > 0 && (
            <div>
              <div className="text-[12px] uppercase tracking-wider text-fg-subtle mb-1.5">Mentions</div>
              <div className="flex flex-wrap gap-1.5">
                {run.brandMentions.map((m) => (
                  <Badge key={m.brand}>
                    {m.brand} ·{' '}
                    <span className="text-fg-muted ml-0.5 tabular-nums">{m.count}</span>
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-fg-subtle uppercase tracking-wider text-[12px]">{label}</span>
      <span className="font-medium tabular-nums">{value}</span>
    </div>
  );
}
