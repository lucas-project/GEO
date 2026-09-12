'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Loader2, Lightbulb, Copy, Check, ExternalLink, History, X } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { JobProgress, resolveJobProgressLabel } from '@/components/geo/job-progress';
import { CancelRunningJobButton } from '@/components/geo/cancel-running-job-button';
import type { GeoContentKeyword, GeoContentPack, GeoContentSection } from '@modules/geo-content';
import { GEO_CONTENT_FORMATS, FORMAT_PROMPT_GUIDE } from '@modules/geo-content';
import { AuditHelpBlurb, LatestAuditReportLink } from '@/features/workspace/audit-help';
import { useWorkspaceTarget } from '@/features/workspace/workspace-target-context';
import { useGeoContentJob } from './geo-content-job-context';
import { useGeoContentHistory, type GeoContentHistoryEntry } from './geo-content-history';

const FORMAT_LABEL: Record<string, string> = {
  qa: 'Q&A',
  step_by_step: 'Step-by-step',
  comparison: 'Comparison',
  definition: 'Definition',
  concise_answer: 'Concise answer',
  professional_explanation: 'Professional explanation',
};

const SOURCE_LABEL: Record<GeoContentKeyword['source'], string> = {
  heading: 'Heading',
  title: 'Title',
  description: 'Description',
  faq: 'FAQ',
  body: 'Page text',
};

function sortSections(sections: GeoContentSection[]): GeoContentSection[] {
  const rank = new Map(GEO_CONTENT_FORMATS.map((f, i) => [f, i]));
  return [...sections].sort((a, b) => (rank.get(a.format) ?? 0) - (rank.get(b.format) ?? 0));
}

function formatWhen(iso: string) {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export function GeoContentWorkspace() {
  const { targetUrl, lastAuditId } = useWorkspaceTarget();
  const [copied, setCopied] = useState(false);
  const { entries: history, hydrated, addEntry, removeEntry, clearHistory } = useGeoContentHistory();
  const {
    result,
    resultError,
    failedError,
    isInterrupted,
    isRunning,
    jobId,
    job,
    jobQuery,
    progress,
    enqueueError,
    startGeneration,
    cancelGeneration,
    setResult,
  } = useGeoContentJob();

  const [viewOverride, setViewOverride] = useState<{
    auditId: string;
    url: string;
    keywords: GeoContentKeyword[];
    pack: GeoContentPack;
  } | null>(null);

  const savedToHistoryRef = useRef<string | null>(null);

  useEffect(() => {
    if (!result) return;
    const key = `${result.auditId}:${result.pack.inferredTopic}`;
    if (savedToHistoryRef.current === key) return;
    savedToHistoryRef.current = key;
    addEntry({
      auditId: result.auditId,
      url: result.url,
      keywords: result.keywords,
      pack: result.pack,
    });
  }, [result, addEntry]);

  const active = viewOverride ?? (result ? { ...result } : null);
  const pack = active?.pack;
  const keywords = active?.keywords ?? [];
  const resultAuditId = active?.auditId;
  const resultUrl = active?.url;

  const contentSections = pack?.sections ? sortSections(pack.sections) : [];

  const loadHistory = (entry: GeoContentHistoryEntry) => {
    setViewOverride({
      auditId: entry.auditId,
      url: entry.url,
      keywords: entry.keywords,
      pack: entry.pack,
    });
    setResult({
      auditId: entry.auditId,
      url: entry.url,
      keywords: entry.keywords,
      pack: entry.pack,
    });
  };

  const copyAll = async () => {
    if (!pack) return;
    const blocks = contentSections.map((s) => {
      const label = FORMAT_LABEL[s.format] ?? s.format;
      const lines = s.prompts.map((p) => `  - ${p}`).join('\n');
      return `### ${label}\n${lines}`;
    });
    const text = [
      `Topic: ${pack.inferredTopic}`,
      `Audience: ${pack.audience}`,
      `Positioning: ${pack.positioning}`,
      '',
      keywords.length ? `Keywords: ${keywords.map((k) => k.term).join(', ')}` : '',
      '',
      blocks.join('\n\n'),
    ]
      .filter(Boolean)
      .join('\n\n');
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const showJobProgress = Boolean(jobId) || Boolean(failedError);
  const progressStatus = job?.status ?? (failedError ? 'failed' : undefined);
  const progressLabel = resolveJobProgressLabel({
    jobId: showJobProgress ? jobId ?? 'stored' : null,
    forceShow: Boolean(failedError),
    status: progressStatus,
    progress,
    isQueryPending: jobQuery.isPending,
    isQueryError: jobQuery.isError,
    labels: {
      running: (pct) =>
        job?.statusMessage ? job.statusMessage : `Generating content ideas… ${pct}%`,
      completed: result ? 'Ideas ready' : 'Complete — loading results…',
      failed: isInterrupted ? 'Generation interrupted' : 'Generation failed',
      cancelled: 'Generation cancelled',
    },
  });

  const errorMessage =
    failedError ?? resultError ?? (enqueueError ? enqueueError.message : null);

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_260px]">
        <div className="space-y-6 min-w-0">
          <Card className="p-5 space-y-4">
            <AuditHelpBlurb />
            <div className="rounded-lg border border-border-subtle bg-bg-muted/30 px-3 py-2.5 text-sm">
              <span className="text-[12px] uppercase tracking-wider text-fg-subtle block mb-1">Site for this run</span>
              <span className="font-mono text-fg">{targetUrl.trim() || '— set your URL in the bar above —'}</span>
            </div>
            <LatestAuditReportLink auditId={lastAuditId} />
            {!lastAuditId && targetUrl.trim() && (
              <p className="text-[13px] text-amber-600/90 dark:text-amber-400/90 leading-relaxed">
                No audit report yet for this URL. Run a{' '}
                <Link href="/audit" className="underline font-medium">
                  GEO Audit
                </Link>{' '}
                first, then return here to generate content ideas.
              </p>
            )}
            <p className="text-[13px] text-fg-subtle leading-relaxed">
              Uses the latest completed audit for that site. Finds short keywords, then one prompt list per content
              type. Prompts only — no answers. You can leave this page while generation runs in the background.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                disabled={isRunning || !targetUrl.trim()}
                onClick={() => {
                  setViewOverride(null);
                  startGeneration();
                }}
              >
                {isRunning ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Detecting…
                  </>
                ) : (
                  <>
                    <Lightbulb className="w-4 h-4" />
                    Detect site & generate ideas
                  </>
                )}
              </Button>
              {isRunning && (
                <CancelRunningJobButton onCancel={() => void cancelGeneration()} />
              )}
              {pack && (
                <Button type="button" variant="outline" size="sm" onClick={() => void copyAll()}>
                  {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  {copied ? 'Copied' : 'Copy all'}
                </Button>
              )}
            </div>
            {showJobProgress && (
              <JobProgress
                jobId={jobId}
                forceShow={Boolean(failedError)}
                status={progressStatus}
                progress={progress}
                statusMessage={job?.statusMessage}
                error={failedError ?? undefined}
                label={progressLabel}
                failedHint={
                  isInterrupted
                    ? 'The server may have restarted. Start a new run when ready.'
                    : undefined
                }
                onCancel={isRunning ? () => void cancelGeneration() : undefined}
              />
            )}
            {errorMessage && (
              <p className="text-sm text-danger" role="alert">
                {errorMessage}
              </p>
            )}
          </Card>

          {pack && resultAuditId && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2 text-sm text-fg-muted">
                <span className="font-mono text-xs">{resultUrl}</span>
                <Link
                  href={`/audit/${resultAuditId}`}
                  className="text-xs text-accent inline-flex items-center gap-1 hover:underline"
                >
                  View audit report <ExternalLink className="w-3 h-3" />
                </Link>
              </div>

              {keywords.length > 0 && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">Relevant keywords</CardTitle>
                    <p className="text-[13px] text-fg-subtle mt-1">
                      Short phrases from your site (max 3 words). Used together for all sections below — not split
                      into meaningless fragments.
                    </p>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap gap-2">
                      {keywords.map((k) => (
                        <span
                          key={`${k.term}-${k.source}`}
                          className="inline-flex items-center gap-1.5 rounded-full border border-border-subtle bg-bg-muted/50 px-2.5 py-1 text-xs"
                          title={`Relevance ${Math.round(k.relevance * 100)}% · ${SOURCE_LABEL[k.source]}`}
                        >
                          <span className="font-medium text-fg">{k.term}</span>
                          <span className="text-[12px] text-fg-subtle">{SOURCE_LABEL[k.source]}</span>
                        </span>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Topic & positioning</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <div>
                    <span className="text-fg-subtle text-[12px] uppercase tracking-wider">Inferred topic</span>
                    <p className="text-fg font-medium mt-0.5">{pack.inferredTopic}</p>
                  </div>
                  <div>
                    <span className="text-fg-subtle text-[12px] uppercase tracking-wider">Audience</span>
                    <p className="text-fg-muted mt-0.5">{pack.audience}</p>
                  </div>
                  <div>
                    <span className="text-fg-subtle text-[12px] uppercase tracking-wider">Positioning</span>
                    <p className="text-fg-muted mt-0.5 leading-relaxed">{pack.positioning}</p>
                  </div>
                </CardContent>
              </Card>

              <div className="space-y-4">
                <h2 className="text-sm font-semibold text-fg">Content prompts</h2>
                <p className="text-[13px] text-fg-subtle -mt-2">
                  One section per type — varied questions and angles across all keywords above.
                </p>
                {contentSections.map((section) => (
                  <Card key={section.format}>
                    <CardHeader className="pb-2">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <CardTitle className="text-sm font-medium">
                          {FORMAT_LABEL[section.format] ?? section.format}
                        </CardTitle>
                        <Badge variant="outline" className="text-[12px]">
                          {section.prompts.length} prompts
                        </Badge>
                      </div>
                      <p className="text-[13px] text-fg-subtle mt-1 leading-relaxed">
                        {FORMAT_PROMPT_GUIDE[section.format]}
                      </p>
                    </CardHeader>
                    <CardContent>
                      <ul className="space-y-2 text-sm text-fg-muted list-none pl-0">
                        {section.prompts.map((prompt, i) => (
                          <li key={i} className="flex gap-2 leading-relaxed">
                            <span className="text-fg-subtle shrink-0 select-none">•</span>
                            <span>{prompt}</span>
                          </li>
                        ))}
                      </ul>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </div>

        <aside className="space-y-2 lg:sticky lg:top-4 lg:self-start">
          <div className="flex items-center justify-between gap-2 px-1">
            <h2 className="text-xs font-semibold text-fg-muted uppercase tracking-wider flex items-center gap-1.5">
              <History className="w-3.5 h-3.5" />
              History
            </h2>
            {hydrated && history.length > 0 && (
              <button
                type="button"
                onClick={clearHistory}
                className="text-[12px] text-fg-subtle hover:text-danger transition-colors"
              >
                Clear all
              </button>
            )}
          </div>
          {!hydrated ? (
            <p className="text-xs text-fg-subtle px-1">Loading…</p>
          ) : history.length === 0 ? (
            <p className="text-xs text-fg-subtle px-1 leading-relaxed">
              Past runs appear here after you detect a site and generate ideas.
            </p>
          ) : (
            <ul className="space-y-1.5 max-h-[min(70vh,520px)] overflow-y-auto pr-0.5">
              {history.map((entry) => {
                const isActive =
                  active?.auditId === entry.auditId &&
                  active?.pack.inferredTopic === entry.pack.inferredTopic;
                const sectionCount = entry.pack.sections?.length ?? 0;
                return (
                  <li key={entry.id}>
                    <button
                      type="button"
                      onClick={() => loadHistory(entry)}
                      className={`w-full text-left rounded-lg border px-3 py-2.5 transition-colors ${
                        isActive
                          ? 'border-accent/50 bg-accent/5'
                          : 'border-border-subtle bg-bg-elevated/40 hover:border-border-strong hover:bg-bg-muted/50'
                      }`}
                    >
                      <p className="text-xs font-medium text-fg truncate">{entry.pack.inferredTopic}</p>
                      <p className="text-[12px] text-fg-subtle font-mono truncate mt-0.5">{entry.url}</p>
                      <p className="text-[12px] text-fg-subtle mt-1">
                        {formatWhen(entry.createdAt)} · {entry.keywords.length} keywords · {sectionCount} sections
                      </p>
                    </button>
                    <button
                      type="button"
                      aria-label="Remove from history"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeEntry(entry.id);
                        if (isActive) {
                          setViewOverride(null);
                          setResult(null);
                        }
                      }}
                      className="mt-0.5 ml-auto flex items-center gap-1 text-[12px] text-fg-subtle hover:text-danger px-3"
                    >
                      <X className="w-3 h-3" />
                      Remove
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </aside>
      </div>
    </div>
  );
}
