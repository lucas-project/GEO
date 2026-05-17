'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, Copy, ExternalLink, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { api } from '@/lib/api-client';
import type { Dimension, PageIssueImpact, PageCodeHighlight } from '@modules/geo-audit';
import { SourceCodePanel } from './source-code-panel';
import { HighlightSnippetPanel } from './highlight-snippet';

interface IssuePageEvidenceProps {
  auditId: string;
  impactedPages: PageIssueImpact[];
  issueFixHint?: string;
  issueDimension: Dimension;
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="text-[12px] text-fg-subtle hover:text-fg flex items-center gap-1"
      onClick={() => {
        void navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
    >
      <Copy className="h-3 w-3" />
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
}

function FullPageSource({
  auditId,
  url,
  highlights,
  issueFixHint,
  issueDimension,
}: {
  auditId: string;
  url: string;
  highlights: PageCodeHighlight[];
  issueFixHint?: string;
  issueDimension: Dimension;
}) {
  const [open, setOpen] = useState(false);
  const { data, isLoading, isError } = useQuery({
    queryKey: ['audit-page-source', auditId, url],
    queryFn: () =>
      api.get<{
        html: string;
        offset: number;
        truncated: boolean;
        statusCode: number;
        error: string | null;
      }>(`/api/geo-audit/${auditId}/page-source?url=${encodeURIComponent(url)}`),
    enabled: open,
  });

  return (
    <div className="mt-2">
      <button
        type="button"
        className="text-[13px] text-accent hover:underline"
        onClick={() => setOpen((v) => !v)}
      >
        {open ? 'Hide full page source' : 'View full page source'}
      </button>
      {open && (
        <div className="mt-2">
          {isLoading && (
            <p className="text-xs text-fg-muted p-3 flex items-center gap-2 border border-border rounded-md">
              <Loader2 className="h-3 w-3 animate-spin" />
              Loading rendered HTML…
            </p>
          )}
          {isError && (
            <p className="text-xs text-danger p-3 border border-border rounded-md">
              Could not load page source for this URL.
            </p>
          )}
          {data && (
            <SourceCodePanel
              source={data.html}
              sourceOffset={data.offset ?? 0}
              highlights={highlights}
              issueFixHint={issueFixHint}
              rewriteContext={{ auditId, pageUrl: url, issueDimension }}
              meta={`HTTP ${data.statusCode}${data.truncated ? ' · truncated' : ''}${data.offset ? ` · offset ${data.offset}` : ''}${data.error ? ` · ${data.error}` : ''}`}
              inlineMaxHeight="max-h-96"
            />
          )}
        </div>
      )}
    </div>
  );
}

function HighlightBlock({
  auditId,
  pageUrl,
  highlight: initial,
  issueDimension,
  issueFixHint,
  loadSource,
}: {
  auditId: string;
  pageUrl: string;
  highlight: PageCodeHighlight;
  issueDimension: Dimension;
  issueFixHint?: string;
  loadSource: boolean;
}) {
  const [highlight, setHighlight] = useState(initial);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  const improveWithAi = async () => {
    setAiLoading(true);
    setAiError(null);
    try {
      const res = await api.post<{ suggestedExample: string; rationale?: string }>(
        `/api/geo-audit/${auditId}/suggest-rewrite`,
        {
          pageUrl,
          highlightLabel: highlight.label,
          content: highlight.content,
          heading: highlight.label.replace(/^Section:\s*/i, ''),
          dimension: issueDimension,
        },
      );
      setHighlight((h) => ({ ...h, suggestedExample: res.suggestedExample }));
    } catch {
      setAiError('Could not generate an AI suggestion. Try again or use the template example.');
    } finally {
      setAiLoading(false);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between gap-2 mb-1">
        <span className="text-[12px] font-medium text-fg">{highlight.label}</span>
        <span className="text-[12px] text-fg-subtle">{highlight.kind === 'chunk' ? 'text' : 'html'}</span>
      </div>
      {highlight.problem && (
        <p className="text-[13px] text-fg-muted mb-1.5 leading-relaxed">
          <span className="font-medium text-fg">What&apos;s wrong: </span>
          {highlight.problem}
        </p>
      )}
      {highlight.fixHint && (
        <p className="text-[13px] text-fg-muted mb-1.5 leading-relaxed whitespace-pre-line">
          <span className="font-medium text-fg">What to do: </span>
          {highlight.fixHint}
        </p>
      )}
      {highlight.suggestedExample && (
        <div className="mb-2 rounded-md border border-border-subtle bg-bg-elevated p-2.5">
          <div className="flex items-center justify-between gap-2 mb-1">
            <span className="text-[12px] font-medium text-fg">Example rewrite</span>
            <CopyButton text={highlight.suggestedExample} />
          </div>
          <p className="text-[13px] text-fg-muted leading-relaxed whitespace-pre-wrap">
            {highlight.suggestedExample}
          </p>
        </div>
      )}
      <HighlightSnippetPanel
        auditId={auditId}
        pageUrl={pageUrl}
        highlight={highlight}
        issueFixHint={issueFixHint ?? highlight.fixHint}
        issueDimension={issueDimension}
        loadSource={loadSource}
      />
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={aiLoading}
          onClick={() => void improveWithAi()}
          className="text-[12px] px-2.5 py-1 rounded border border-accent/40 text-accent hover:bg-accent/5 disabled:opacity-50"
        >
          {aiLoading ? (
            <span className="inline-flex items-center gap-1">
              <Loader2 className="h-3 w-3 animate-spin" />
              Improving…
            </span>
          ) : (
            'Improve with AI'
          )}
        </button>
        <CopyButton text={highlight.content} />
      </div>
      {aiError && <p className="text-[12px] text-danger mt-1">{aiError}</p>}
    </div>
  );
}

function PageImpactRow({
  auditId,
  page,
  issueFixHint,
  issueDimension,
}: {
  auditId: string;
  page: PageIssueImpact;
  issueFixHint?: string;
  issueDimension: Dimension;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-md border border-border-subtle bg-bg overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-bg-subtle transition-colors"
        aria-expanded={open}
      >
        <ChevronDown
          className={cn('h-3.5 w-3.5 text-fg-muted shrink-0 transition-transform', open && 'rotate-180')}
        />
        <div className="flex-1 min-w-0">
          <a
            href={page.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-accent hover:underline break-all inline-flex items-start gap-1"
            onClick={(e) => e.stopPropagation()}
          >
            {page.url}
            <ExternalLink className="h-3 w-3 shrink-0 mt-0.5" />
          </a>
          {page.pathHint && (
            <span className="text-[12px] text-fg-subtle ml-2">({page.pathHint})</span>
          )}
        </div>
        <span className="text-[12px] text-fg-subtle shrink-0">
          {page.pageReasons.length} issue{page.pageReasons.length !== 1 ? 's' : ''}
        </span>
      </button>

      {open && (
        <div className="border-t border-border-subtle px-3 py-3 space-y-3">
          {page.pageReasons.length > 0 && (
            <ul className="space-y-1 text-xs text-fg-muted list-disc pl-4">
              {page.pageReasons.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          )}

          {page.highlights.map((h, i) => (
            <HighlightBlock
              key={`${h.label}-${i}`}
              auditId={auditId}
              pageUrl={page.url}
              highlight={h}
              issueDimension={issueDimension}
              issueFixHint={issueFixHint}
              loadSource={open}
            />
          ))}

          <FullPageSource
            auditId={auditId}
            url={page.url}
            highlights={page.highlights}
            issueFixHint={issueFixHint}
            issueDimension={issueDimension}
          />
        </div>
      )}
    </div>
  );
}

export function IssuePageEvidence({
  auditId,
  impactedPages,
  issueFixHint,
  issueDimension,
}: IssuePageEvidenceProps) {
  if (impactedPages.length === 0) return null;

  return (
    <div>
      <h5 className="text-[12px] uppercase tracking-wider text-fg-subtle mb-1">
        Impacted pages ({impactedPages.length})
      </h5>
      <p className="text-[12px] text-fg-subtle mb-2 leading-relaxed">
        Each URL below had problems found during the audit. Expand a page to see highlighted snippets
        and optional full page source.
      </p>
      <div className="space-y-2">
        {impactedPages.map((page) => (
          <PageImpactRow
            key={page.url}
            auditId={auditId}
            page={page}
            issueFixHint={issueFixHint}
            issueDimension={issueDimension}
          />
        ))}
      </div>
      {impactedPages.length > 3 && (
        <p className="text-[12px] text-fg-subtle mt-2">
          Expand each page to see highlighted snippets and full source.
        </p>
      )}
    </div>
  );
}
