'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Copy, Maximize2, Minimize2, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api-client';
import {
  buildHighlightedSource,
  plainTextForRewrite,
  type SourceMarkDetail,
} from '@/lib/highlight-source';
import type { Dimension, PageCodeHighlight } from '@modules/geo-audit';

export interface SourceRewriteContext {
  auditId: string;
  pageUrl?: string;
  issueDimension: Dimension;
}

interface SourceCodePanelProps {
  source: string;
  highlights?: PageCodeHighlight[];
  /** Byte offset when source is a window slice of full page HTML. */
  sourceOffset?: number;
  /** Fallback when a mark has no fixHint (issue-level recommendation). */
  issueFixHint?: string;
  /** Enables per-highlight rewrite UI in the enlarged viewer. */
  rewriteContext?: SourceRewriteContext;
  meta?: string;
  inlineMaxHeight?: string;
  className?: string;
}

function parseSectionHeading(label: string): string | undefined {
  const m = label.match(/^Section:\s*(.+)$/i);
  return m?.[1]?.trim();
}

function HighlightContextBanner({
  detail,
  index,
  total,
  fallbackFixHint,
}: {
  detail: SourceMarkDetail;
  index: number;
  total: number;
  fallbackFixHint?: string;
}) {
  const fixHint = detail.fixHint ?? fallbackFixHint;

  return (
    <div className="px-4 py-3 border-b border-border-subtle bg-warning/5 space-y-2 min-w-0 shrink-0">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-semibold text-warning leading-snug">{detail.label}</p>
        <span className="text-[12px] text-fg-muted tabular-nums shrink-0 pt-0.5">
          {index + 1} / {total}
        </span>
      </div>
      {detail.problem && (
        <p className="text-xs text-fg leading-relaxed">{detail.problem}</p>
      )}
      {fixHint && (
        <p className="text-[13px] text-warning leading-relaxed rounded-md border border-warning/30 bg-warning/5 px-2.5 py-2 whitespace-pre-line">
          <span className="font-medium">What to do: </span>
          {fixHint}
        </p>
      )}
      {detail.suggestedExample && (
        <div className="rounded-md border border-border-subtle bg-bg px-2.5 py-2">
          <p className="text-[12px] font-medium text-fg mb-1">Example rewrite</p>
          <p className="text-[13px] text-fg-muted leading-relaxed whitespace-pre-wrap">
            {detail.suggestedExample}
          </p>
        </div>
      )}
    </div>
  );
}

function HighlightRewriteEditor({
  auditId,
  pageUrl,
  issueDimension,
  activeIndex,
  total,
  markTexts,
  activeDetail,
  fallbackFixHint,
}: {
  auditId: string;
  pageUrl?: string;
  issueDimension: Dimension;
  activeIndex: number;
  total: number;
  markTexts: string[];
  activeDetail: SourceMarkDetail;
  fallbackFixHint?: string;
}) {
  const rawSlice = markTexts[activeIndex] ?? '';
  const [draft, setDraft] = useState('');
  const [isRewritten, setIsRewritten] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, setRewriteVariant] = useState(0);
  const variantIndexRef = useRef(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setDraft(plainTextForRewrite(rawSlice));
    setIsRewritten(false);
    variantIndexRef.current = 0;
    setRewriteVariant(0);
    setError(null);
  }, [activeIndex, rawSlice]);

  const heading = parseSectionHeading(activeDetail.label);

  const sourceText = plainTextForRewrite(rawSlice);

  const runRewrite = async () => {
    if (!sourceText.trim()) return;
    const variantIndex = variantIndexRef.current;
    variantIndexRef.current += 1;
    setLoading(true);
    setError(null);
    setIsRewritten(false);
    try {
      const res = await api.post<{ suggestedExample: string; rationale?: string }>(
        `/api/geo-audit/${auditId}/suggest-rewrite`,
        {
          pageUrl,
          highlightLabel: activeDetail.label,
          content: sourceText,
          heading,
          dimension: issueDimension,
          problem: activeDetail.problem,
          fixHint: activeDetail.fixHint ?? fallbackFixHint,
          variantIndex,
        },
      );
      const text = res.suggestedExample?.trim();
      if (!text) {
        setError('No rewrite was returned. Try again.');
        return;
      }
      setDraft(text);
      setIsRewritten(true);
      setRewriteVariant(variantIndexRef.current);
      requestAnimationFrame(() => {
        const el = textareaRef.current;
        if (!el) return;
        el.focus();
        el.select();
      });
    } catch (err) {
      const msg =
        err instanceof Error && err.message ? err.message : 'Rewrite failed. Try again.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="px-4 py-3 space-y-2 min-h-0">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[12px] font-medium text-fg">
          {isRewritten ? 'Rewritten text' : 'Your version'}
        </p>
        <span className="text-[12px] text-fg-subtle tabular-nums">
          {activeIndex + 1} / {total}
        </span>
      </div>
      <p className="text-[12px] text-fg-muted leading-relaxed">
        {isRewritten
          ? 'Copy the text below into your page. Use Previous/Next to switch highlights.'
          : 'Edit if needed, then Rewrite — the result appears in this box.'}
      </p>
      <textarea
        ref={textareaRef}
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value);
          setIsRewritten(false);
        }}
        rows={6}
        readOnly={loading}
        className={cn(
          'w-full text-[13px] leading-relaxed rounded-md border px-3 py-2 text-fg resize-y min-h-[7rem] focus:outline-none focus:ring-2',
          isRewritten
            ? 'border-accent/50 bg-accent/5 ring-2 ring-accent/30 focus:ring-accent/50'
            : 'border-border bg-bg-elevated focus:ring-accent/40',
          loading && 'opacity-60',
        )}
        placeholder={loading ? 'Rewriting…' : 'Highlighted sentence from source…'}
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" onClick={() => void runRewrite()} disabled={loading || !sourceText.trim()}>
          {loading ? 'Rewriting…' : isRewritten ? 'Rewrite again' : 'Rewrite'}
        </Button>
        <CopyButton text={draft} />
        {isRewritten && <span className="text-[12px] text-accent font-medium">Ready to copy</span>}
      </div>
      {error && <p className="text-[12px] text-danger">{error}</p>}
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="text-[12px] text-fg-subtle hover:text-fg flex items-center gap-1 px-2 py-1 rounded hover:bg-bg-subtle"
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

function HighlightedPre({
  highlightedHtml,
  matchCount,
  showMatchBanner,
  maxHeightClass,
  activeMarkIndex = 0,
  scrollToActiveMark = false,
}: {
  highlightedHtml: string;
  matchCount: number;
  showMatchBanner?: boolean;
  maxHeightClass?: string;
  activeMarkIndex?: number;
  scrollToActiveMark?: boolean;
}) {
  const preRef = useRef<HTMLPreElement>(null);

  useEffect(() => {
    const pre = preRef.current;
    if (!pre || matchCount === 0) return;

    const marks = pre.querySelectorAll('mark.geo-source-mark');
    marks.forEach((mark, i) => {
      mark.classList.toggle('geo-source-mark-active', i === activeMarkIndex);
    });

    if (scrollToActiveMark && marks[activeMarkIndex]) {
      marks[activeMarkIndex].scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  }, [scrollToActiveMark, highlightedHtml, activeMarkIndex, matchCount]);

  return (
    <div className={cn('flex flex-col min-h-0', maxHeightClass?.includes('flex-1') && 'flex-1')}>
      {showMatchBanner && matchCount > 0 && (
        <p className="text-[12px] text-warning px-3 pt-2 pb-0 shrink-0">
          {matchCount} highlight{matchCount !== 1 ? 's' : ''} in source
        </p>
      )}
      <pre
        ref={preRef}
        className={cn(
          'text-[12px] leading-relaxed p-3 overflow-auto font-mono whitespace-pre-wrap break-all text-fg-muted flex-1 min-h-0',
          '[&_mark.geo-source-mark]:bg-warning/30 [&_mark.geo-source-mark]:text-fg [&_mark.geo-source-mark]:rounded-sm [&_mark.geo-source-mark]:px-0.5 [&_mark.geo-source-mark]:ring-1 [&_mark.geo-source-mark]:ring-warning/50',
          '[&_mark.geo-source-mark-active]:bg-warning/50 [&_mark.geo-source-mark-active]:ring-2 [&_mark.geo-source-mark-active]:ring-warning',
          maxHeightClass,
        )}
        dangerouslySetInnerHTML={{ __html: highlightedHtml }}
      />
    </div>
  );
}

export function SourceCodePanel({
  source,
  highlights = [],
  sourceOffset = 0,
  issueFixHint,
  rewriteContext,
  meta,
  inlineMaxHeight = 'max-h-96',
  className,
}: SourceCodePanelProps) {
  const [expanded, setExpanded] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const { html: highlightedHtml, matchCount, markDetails, markTexts } = buildHighlightedSource(
    source,
    highlights,
    sourceOffset,
  );

  const activeMark =
    matchCount > 0
      ? (markDetails[activeIndex] ?? {
          label: `Highlight ${activeIndex + 1}`,
        })
      : null;

  const goPrev = useCallback(() => {
    if (matchCount === 0) return;
    setActiveIndex((i) => (i - 1 + matchCount) % matchCount);
  }, [matchCount]);

  const goNext = useCallback(() => {
    if (matchCount === 0) return;
    setActiveIndex((i) => (i + 1) % matchCount);
  }, [matchCount]);

  const openExpanded = () => {
    setActiveIndex(0);
    setExpanded(true);
  };

  useEffect(() => {
    if (!expanded) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setExpanded(false);
        return;
      }
      if (matchCount === 0) return;
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        goPrev();
      }
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault();
        goNext();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [expanded, matchCount, goPrev, goNext]);

  useEffect(() => {
    if (expanded) document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, [expanded]);

  useEffect(() => {
    if (activeIndex >= matchCount && matchCount > 0) {
      setActiveIndex(0);
    }
  }, [activeIndex, matchCount]);

  const toolbar = (
    <div className="flex items-center justify-between gap-2 px-3 py-1.5 border-b border-border-subtle bg-bg-elevated shrink-0">
      <span className="text-[12px] text-fg-subtle truncate">
        {meta}
        {matchCount > 0 && (
          <span className="text-warning ml-1.5">
            · {matchCount} highlight{matchCount !== 1 ? 's' : ''}
          </span>
        )}
      </span>
      <div className="flex items-center gap-1 shrink-0">
        {matchCount === 0 && highlights.length > 0 && (
          <span className="text-[12px] text-fg-subtle mr-1">No exact match in source</span>
        )}
        <CopyButton text={source} />
        <button
          type="button"
          className="text-[12px] text-fg-subtle hover:text-fg flex items-center gap-1 px-2 py-1 rounded hover:bg-bg-subtle"
          onClick={openExpanded}
          title="Enlarge source viewer"
        >
          <Maximize2 className="h-3 w-3" />
          Enlarge
        </button>
      </div>
    </div>
  );

  return (
    <>
      <div className={cn('rounded-md border border-border bg-bg overflow-hidden', className)}>
        {toolbar}
        <HighlightedPre
          highlightedHtml={highlightedHtml}
          matchCount={matchCount}
          showMatchBanner
          maxHeightClass={inlineMaxHeight}
        />
      </div>

      {expanded && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/70"
          role="dialog"
          aria-modal="true"
          aria-label="Page source viewer"
          onClick={() => setExpanded(false)}
        >
          <div
            className="flex flex-col w-full max-w-6xl h-[min(90vh,900px)] rounded-lg border border-border bg-bg shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-2 px-4 py-2 border-b border-border bg-bg-elevated shrink-0 flex-wrap">
              <div className="min-w-0">
                <p className="text-sm font-medium text-fg">Page source (Playwright)</p>
                {meta && <p className="text-[13px] text-fg-muted truncate">{meta}</p>}
              </div>
              <div className="flex items-center gap-2 shrink-0 flex-wrap">
                <CopyButton text={source} />
                <button
                  type="button"
                  className="p-2 rounded hover:bg-bg-subtle text-fg-muted hover:text-fg"
                  onClick={() => setExpanded(false)}
                  title="Close"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
            <div className="flex-1 min-h-0 flex overflow-hidden">
              <div className="flex-1 min-w-0 min-h-0 flex flex-col border-r border-border-subtle">
                {highlights.length > 0 && matchCount === 0 && (
                  <p className="text-xs text-fg-muted px-4 py-2 border-b border-border-subtle shrink-0">
                    No exact match in source for these snippets
                  </p>
                )}
                <HighlightedPre
                  highlightedHtml={highlightedHtml}
                  matchCount={matchCount}
                  maxHeightClass="flex-1"
                  activeMarkIndex={activeIndex}
                  scrollToActiveMark
                />
              </div>
              {matchCount > 0 && activeMark && (
                <aside className="w-full sm:w-[min(22rem,38%)] shrink-0 min-h-0 flex flex-col overflow-hidden bg-bg-elevated/50">
                  <div className="overflow-y-auto min-h-0 flex-1 flex flex-col">
                    <HighlightContextBanner
                      detail={activeMark}
                      index={activeIndex}
                      total={matchCount}
                      fallbackFixHint={issueFixHint}
                    />
                    {rewriteContext && (
                      <HighlightRewriteEditor
                        auditId={rewriteContext.auditId}
                        pageUrl={rewriteContext.pageUrl}
                        issueDimension={rewriteContext.issueDimension}
                        activeIndex={activeIndex}
                        total={matchCount}
                        markTexts={markTexts}
                        activeDetail={activeMark}
                        fallbackFixHint={issueFixHint}
                      />
                    )}
                  </div>
                </aside>
              )}
            </div>
            <div className="px-4 py-2 border-t border-border-subtle bg-bg-elevated shrink-0 flex items-center justify-end gap-2 flex-wrap">
              {matchCount > 1 && (
                <>
                  <Button type="button" variant="outline" size="sm" onClick={goPrev}>
                    <ChevronLeft className="h-3.5 w-3.5" />
                    Previous
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={goNext}>
                    Next
                    <ChevronRight className="h-3.5 w-3.5" />
                  </Button>
                </>
              )}
              <button
                type="button"
                className="text-xs text-fg-muted hover:text-fg flex items-center gap-1.5 px-3 py-1.5 rounded border border-border"
                onClick={() => setExpanded(false)}
              >
                <Minimize2 className="h-3.5 w-3.5" />
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
