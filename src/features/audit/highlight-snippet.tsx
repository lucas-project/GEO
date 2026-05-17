'use client';

import { useQuery } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { api } from '@/lib/api-client';
import { buildHighlightedSource } from '@/lib/highlight-source';
import type { Dimension, PageCodeHighlight } from '@modules/geo-audit';
import { SourceCodePanel } from './source-code-panel';

interface HighlightSnippetPanelProps {
  auditId: string;
  pageUrl: string;
  highlight: PageCodeHighlight;
  issueFixHint?: string;
  issueDimension: Dimension;
  /** When true, may fetch full page HTML for range-based highlights. */
  loadSource: boolean;
}

function SnippetPre({ html, className }: { html: string; className?: string }) {
  return (
    <pre
      className={cn(
        'text-[12px] leading-relaxed rounded border border-border bg-bg-elevated p-2 max-h-72 overflow-auto font-mono whitespace-pre-wrap break-all text-fg-muted',
        '[&_mark.geo-source-mark]:bg-warning/30 [&_mark.geo-source-mark]:text-fg [&_mark.geo-source-mark]:rounded-sm [&_mark.geo-source-mark]:px-0.5 [&_mark.geo-source-mark]:ring-1 [&_mark.geo-source-mark]:ring-warning/50',
        className,
      )}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

export function HighlightSnippetPanel({
  auditId,
  pageUrl,
  highlight,
  issueFixHint,
  issueDimension,
  loadSource,
}: HighlightSnippetPanelProps) {
  const needsFullSource =
    loadSource &&
    (Boolean(highlight.sourceRanges?.length) || highlight.kind === 'html');

  const { data, isLoading, isError } = useQuery({
    queryKey: ['audit-page-source', auditId, pageUrl],
    queryFn: () =>
      api.get<{
        html: string;
        offset: number;
        truncated: boolean;
        statusCode: number;
        error: string | null;
      }>(`/api/geo-audit/${auditId}/page-source?url=${encodeURIComponent(pageUrl)}`),
    enabled: needsFullSource,
  });

  const inline = buildHighlightedSource(highlight.content, [highlight]);

  if (needsFullSource) {
    if (isLoading) {
      return (
        <p className="text-xs text-fg-muted p-2 flex items-center gap-2 border border-border rounded-md">
          <Loader2 className="h-3 w-3 animate-spin" />
          Loading page source for highlights…
        </p>
      );
    }
    if (isError) {
      return (
        <>
          <p className="text-[11px] text-fg-subtle mb-1">
            Could not load full page source. Showing the snippet below.
          </p>
          <SnippetPre html={inline.html} />
        </>
      );
    }
    if (data) {
      return (
        <SourceCodePanel
          source={data.html}
          sourceOffset={data.offset ?? 0}
          highlights={[highlight]}
          issueFixHint={issueFixHint ?? highlight.fixHint}
          rewriteContext={{ auditId, pageUrl, issueDimension }}
          meta={`HTTP ${data.statusCode}${data.truncated ? ' · truncated' : ''}`}
          inlineMaxHeight="max-h-72"
        />
      );
    }
  }

  if (inline.matchCount > 0) {
    return <SnippetPre html={inline.html} />;
  }

  return (
    <>
      <p className="text-[11px] text-fg-subtle mb-1 leading-relaxed">
        Exact location could not be marked in source; snippet shown below.
      </p>
      <pre className="text-[12px] leading-relaxed rounded border border-border bg-bg-elevated p-2 max-h-72 overflow-auto font-mono whitespace-pre-wrap text-fg-muted">
        {highlight.content}
      </pre>
    </>
  );
}
