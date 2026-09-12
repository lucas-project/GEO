'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { CheckCircle2, AlertTriangle, Terminal, ChevronRight, ExternalLink, RotateCcw, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api-client';
import type { Platform } from '@modules/ai-simulation';

const PLATFORM_LABEL: Record<Platform, string> = {
  chatgpt: 'ChatGPT',
  gemini: 'Gemini',
  claude: 'Claude',
  perplexity: 'Perplexity',
};

const PLATFORM_SHORT: Record<Platform, string> = {
  chatgpt: 'GPT',
  gemini: 'Gem',
  claude: 'Cla',
  perplexity: 'Ppl',
};

export interface VisibilityPlatformDetail {
  platform: Platform;
  cited: boolean;
  citationCount: number;
  citedDomains?: string[];
  excerpts?: string[];
}

export interface CitationHighlight {
  platform: Platform;
  snippet: string;
  brand?: string;
  domain?: string;
}

export interface VisibilityCheckResultItem {
  prompt: string;
  runId: string;
  questionType?: 'brand' | 'discovery';
  visibilityScore: number;
  mentionedOnPlatforms: Platform[];
  platformDetails?: VisibilityPlatformDetail[];
  citationHighlights?: CitationHighlight[];
}

export interface VisibilityCheckSummary {
  checkedAt: string;
  /** Discovery questions only. */
  promptsTested: number;
  promptsCiting: number;
  averageVisibilityScore: number;
  brandPromptsTested?: number;
  brandLeaderboard?: Array<{ brand: string; count: number }>;
  domainLeaderboard?: Array<{ domain: string; count: number }>;
  results: VisibilityCheckResultItem[];
}

interface VisibilityCheckResultsProps {
  check: VisibilityCheckSummary;
  auditId?: string | null;
  onCheckUpdated?: (check: VisibilityCheckSummary) => void;
  onSelectRun?: (runId: string) => void;
  activeRunId?: string | null;
  platformLabels?: Record<Platform, string>;
  localMultiModel?: boolean;
}

export function VisibilityCheckResults({
  check,
  auditId,
  onCheckUpdated,
  onSelectRun,
  activeRunId,
  platformLabels,
  localMultiModel,
}: VisibilityCheckResultsProps) {
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null);
  const sortedResults = [...check.results].sort((a, b) => {
    const aBrand = a.questionType === 'brand' ? 1 : 0;
    const bBrand = b.questionType === 'brand' ? 1 : 0;
    return aBrand - bBrand;
  });

  return (
    <div className="space-y-3">
      <VisibilityBatchLandscape
        check={check}
        auditId={auditId}
        onCheckUpdated={onCheckUpdated}
      />

      {check.promptsTested === 0 && (check.brandPromptsTested ?? 0) > 0 && (
        <p className="text-[11px] text-amber-600/90 dark:text-amber-400/90 rounded-md border border-amber-500/30 bg-amber-500/5 px-2 py-1.5">
          Headline score uses discovery questions only. This batch had{' '}
          {check.brandPromptsTested} brand-specific question
          {(check.brandPromptsTested ?? 0) === 1 ? '' : 's'} (excluded from score).
        </p>
      )}

      <ul className="space-y-1">
        {sortedResults.map((r) => (
          <VisibilityCheckResultRow
            key={r.runId}
            item={r}
            countsTowardScore={r.questionType !== 'brand'}
            expanded={expandedRunId === r.runId}
            onToggle={() => setExpandedRunId((id) => (id === r.runId ? null : r.runId))}
            onSelectRun={onSelectRun}
            isActiveRun={activeRunId === r.runId}
            platformLabels={platformLabels}
            localMultiModel={localMultiModel}
          />
        ))}
      </ul>
    </div>
  );
}

export function VisibilityBatchLandscape({
  check,
  auditId,
  onCheckUpdated,
}: {
  check: VisibilityCheckSummary;
  auditId?: string | null;
  onCheckUpdated?: (check: VisibilityCheckSummary) => void;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const brands = check.brandLeaderboard ?? [];
  const domains = check.domainLeaderboard ?? [];
  const hasLandscape = brands.length > 0 || domains.length > 0;

  const resetMutation = useMutation({
    mutationFn: () => {
      if (!auditId) throw new Error('Audit ID required');
      return api.post(`/api/geo-audit/${auditId}/reset-simulation-landscape`, {});
    },
    onSuccess: () => {
      const cleared = { ...check, brandLeaderboard: [], domainLeaderboard: [] };
      onCheckUpdated?.(cleared);
      if (auditId) {
        void queryClient.invalidateQueries({ queryKey: ['sim-audit-suggestions', auditId] });
        void queryClient.invalidateQueries({ queryKey: ['geo-audit', auditId] });
      }
      router.refresh();
    },
  });

  if (!hasLandscape && !auditId) return null;

  if (!hasLandscape) {
    return (
      <p className="text-[10px] text-fg-subtle">
        No market landscape saved — run a batch with discovery questions to populate brands and domains.
      </p>
    );
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-end">
        {auditId && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-6 text-[10px] text-fg-muted hover:text-fg gap-1 px-2"
            disabled={resetMutation.isPending}
            onClick={() => resetMutation.mutate()}
          >
            {resetMutation.isPending ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <RotateCcw className="w-3 h-3" />
            )}
            Reset brands & domains
          </Button>
        )}
      </div>
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 rounded-md border border-border-subtle/80 bg-bg-muted/20 p-2">
      <div>
        <p className="text-[10px] font-medium text-fg-muted uppercase tracking-wide mb-1">
          Brands mentioned (discovery only)
        </p>
        {brands.length === 0 ? (
          <p className="text-[11px] text-fg-subtle">None detected</p>
        ) : (
          <ul className="space-y-0.5">
            {brands.slice(0, 8).map((b, i) => (
              <li key={b.brand} className="flex justify-between text-[11px] gap-2">
                <span className="text-fg truncate">
                  {i + 1}. {b.brand}
                </span>
                <span className="text-fg-subtle tabular-nums shrink-0">{b.count}×</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div>
        <p className="text-[10px] font-medium text-fg-muted uppercase tracking-wide mb-1">
          Domains cited (discovery only)
        </p>
        {domains.length === 0 ? (
          <p className="text-[11px] text-fg-subtle">None detected</p>
        ) : (
          <ul className="space-y-0.5">
            {domains.slice(0, 8).map((d, i) => (
              <li key={d.domain} className="flex justify-between text-[11px] gap-2">
                <span className="text-fg font-mono truncate">
                  {i + 1}. {d.domain}
                </span>
                <span className="text-fg-subtle tabular-nums shrink-0">{d.count}×</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <p className="text-[10px] text-fg-subtle sm:col-span-2">
        Updates each batch run from customer-discovery questions — brand-specific prompts are excluded.
      </p>
    </div>
    </div>
  );
}

function VisibilityCheckResultRow({
  item,
  countsTowardScore,
  expanded,
  onToggle,
  onSelectRun,
  isActiveRun,
  platformLabels,
  localMultiModel,
}: {
  item: VisibilityCheckResultItem;
  countsTowardScore: boolean;
  expanded: boolean;
  onToggle: () => void;
  onSelectRun?: (runId: string) => void;
  isActiveRun?: boolean;
  platformLabels?: Record<Platform, string>;
  localMultiModel?: boolean;
}) {
  const details = item.platformDetails?.length
    ? item.platformDetails
    : item.mentionedOnPlatforms.map((platform) => ({
        platform,
        cited: true,
        citationCount: 0,
        citedDomains: [] as string[],
      }));

  const citedCount = details.filter((d) => d.cited).length;
  const highlights =
    item.citationHighlights ??
    details.flatMap((d) =>
      (d.excerpts ?? []).map((snippet) => ({ platform: d.platform, snippet })),
    );

  const platformName = (platform: Platform) =>
    localMultiModel && platformLabels?.[platform]
      ? platformLabels[platform]
      : PLATFORM_LABEL[platform];

  return (
    <li
      className={`rounded-md border bg-bg/40 ${
        isActiveRun ? 'border-accent/50 ring-1 ring-accent/20' : 'border-border-subtle/80'
      }`}
    >
      <div className="flex items-center gap-2 py-1.5 px-2 min-h-[2rem]">
        <button
          type="button"
          onClick={onToggle}
          className="flex items-center gap-2 flex-1 min-w-0 text-left hover:bg-bg-muted/30 rounded -mx-1 px-1 py-0.5"
          aria-expanded={expanded}
        >
          <ChevronRight
            className={`w-3.5 h-3.5 text-fg-subtle shrink-0 transition-transform ${expanded ? 'rotate-90' : ''}`}
          />
          <span
            className={`text-[10px] tabular-nums w-8 shrink-0 font-medium ${
              item.visibilityScore > 0 ? 'text-success' : 'text-fg-subtle'
            }`}
          >
            {item.visibilityScore > 0 ? `${item.visibilityScore}` : '—'}
          </span>
          <span className="text-xs text-fg-muted truncate flex-1 min-w-0" title={item.prompt}>
            {item.prompt}
          </span>
          {item.questionType === 'brand' && (
            <Badge variant="outline" className="text-[9px] h-4 px-1 shrink-0">
              Brand Q
            </Badge>
          )}
          {!countsTowardScore && item.questionType === 'brand' && (
            <span className="text-[9px] text-fg-subtle shrink-0 hidden md:inline">excluded</span>
          )}
          <PlatformDots
            details={details}
            mentioned={item.mentionedOnPlatforms}
            platformLabels={platformLabels}
            localMultiModel={localMultiModel}
          />
        </button>
        {onSelectRun && (
          <button
            type="button"
            onClick={() => onSelectRun(item.runId)}
            className="inline-flex items-center gap-0.5 text-[10px] text-accent hover:underline shrink-0 px-1 py-0.5"
          >
            <ExternalLink className="w-3 h-3" />
            Full run
          </button>
        )}
      </div>

      {expanded && (
        <div className="px-2 pb-2 pt-0 space-y-2 border-t border-border-subtle/60">
          <div className="flex flex-wrap gap-1 pt-1.5">
            {(['chatgpt', 'gemini', 'claude', 'perplexity'] as Platform[]).map((platform) => {
              const detail = details.find((d) => d.platform === platform);
              const cited = detail?.cited ?? item.mentionedOnPlatforms.includes(platform);
              const name = platformName(platform);
              return (
                <span
                  key={platform}
                  className={`inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] border ${
                    cited
                      ? 'border-success/40 bg-success/10 text-fg'
                      : 'border-border-subtle text-fg-subtle line-through'
                  }`}
                  title={name}
                >
                  {localMultiModel ? (
                    <span className="font-mono truncate max-w-[5rem]">{name}</span>
                  ) : (
                    name
                  )}
                  {cited && detail?.citationCount ? (
                    <span className="tabular-nums opacity-70">·{detail.citationCount}</span>
                  ) : null}
                </span>
              );
            })}
          </div>

          {citedCount > 0 && highlights.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[10px] font-medium text-fg-muted uppercase tracking-wide">
                Citation excerpts
              </p>
              {highlights.map((h, i) => (
                <blockquote
                  key={`${h.platform}-${i}`}
                  className="text-[11px] text-fg-muted border-l-2 border-success/40 pl-2 py-0.5"
                >
                  <span className="font-mono text-[10px] text-fg-subtle mr-1.5">
                    {localMultiModel && platformLabels?.[h.platform]
                      ? platformLabels[h.platform].split(':')[0]
                      : PLATFORM_SHORT[h.platform]}
                  </span>
                  {h.snippet}
                  {(h.brand || h.domain) && (
                    <span className="block text-[10px] text-fg-subtle mt-0.5">
                      {h.brand && <span>{h.brand}</span>}
                      {h.brand && h.domain && ' · '}
                      {h.domain && <span className="font-mono">{h.domain}</span>}
                    </span>
                  )}
                </blockquote>
              ))}
            </div>
          )}

          {citedCount > 0 && highlights.length === 0 && citedDomainsLine(details)}

          {citedCount === 0 && (
            <p className="text-[10px] text-fg-subtle italic">Not cited on any platform for this question.</p>
          )}
        </div>
      )}
    </li>
  );
}

function PlatformDots({
  details,
  mentioned,
  platformLabels,
  localMultiModel,
}: {
  details: VisibilityPlatformDetail[];
  mentioned: Platform[];
  platformLabels?: Record<Platform, string>;
  localMultiModel?: boolean;
}) {
  return (
    <span className="flex gap-0.5 shrink-0" aria-hidden>
      {(['chatgpt', 'gemini', 'claude', 'perplexity'] as Platform[]).map((platform) => {
        const detail = details.find((d) => d.platform === platform);
        const cited = detail?.cited ?? mentioned.includes(platform);
        const short =
          localMultiModel && platformLabels?.[platform]
            ? platformLabels[platform].split(':')[0]?.slice(0, 4) ?? platform.slice(0, 3)
            : PLATFORM_SHORT[platform];
        return (
          <span
            key={platform}
            title={
              localMultiModel && platformLabels?.[platform]
                ? platformLabels[platform]
                : PLATFORM_LABEL[platform]
            }
            className={`text-[9px] font-medium min-w-[1.25rem] text-center rounded px-0.5 font-mono ${
              cited ? 'bg-success/20 text-success' : 'bg-bg-muted text-fg-subtle/50'
            }`}
          >
            {short}
          </span>
        );
      })}
    </span>
  );
}

function citedDomainsLine(details: VisibilityPlatformDetail[]): ReactNode {
  const domains = [
    ...new Set(details.flatMap((d) => (d.cited ? d.citedDomains ?? [] : [])).filter(Boolean)),
  ].slice(0, 6);
  if (domains.length === 0) return null;
  return (
    <p className="text-[10px] text-fg-subtle">
      <span className="text-fg-muted mr-1">Domains cited:</span>
      {domains.map((d) => (
        <span key={d} className="font-mono mr-1.5">
          {d}
        </span>
      ))}
    </p>
  );
}

interface OllamaSetupBannerProps {
  ollama: {
    enabled: boolean;
    reachable: boolean;
    ready: boolean;
    missingModels: string[];
    setupSteps: string[];
  } | null;
}

export function OllamaSetupBanner({ ollama }: OllamaSetupBannerProps) {
  if (!ollama) return null;

  const show = ollama.enabled || ollama.setupSteps.length > 0;
  if (!show) return null;

  const ok = ollama.ready;
  const warn = ollama.enabled && !ollama.ready;

  return (
    <div
      className={`rounded-md border px-3 py-2 text-xs ${
        ok
          ? 'border-success/30 bg-success/5'
          : warn
            ? 'border-amber-500/30 bg-amber-500/5'
            : 'border-border-subtle bg-bg-muted/30'
      }`}
    >
      <div className="flex items-start gap-2">
        {ok ? (
          <CheckCircle2 className="w-3.5 h-3.5 text-success shrink-0 mt-0.5" />
        ) : (
          <AlertTriangle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
        )}
        <div className="space-y-1 min-w-0">
          <p className="font-medium text-fg text-xs">
            {ok
              ? 'Ollama ready'
              : ollama.enabled
                ? 'Ollama needs setup'
                : 'Optional: Ollama local simulation'}
          </p>
          <ol className="list-decimal list-inside space-y-0.5 text-fg-muted text-[11px]">
            {ollama.setupSteps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
          {ollama.missingModels.length > 0 && (
            <p className="text-[10px] text-fg-subtle flex items-center gap-1">
              <Terminal className="w-3 h-3" />
              Missing: {ollama.missingModels.join(', ')}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
