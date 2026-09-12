'use client';

import { useCallback, useState, type RefObject } from 'react';
import { ChevronDown, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';
import type {
  Dimension,
  DimensionScore,
  GateApplied,
  LayerEvidence,
  ScoreLayer,
} from '@modules/geo-audit';
import { LayerScoringBreakdown } from './layer-scoring-breakdown';

interface LayerEvidencePanelProps {
  evidence: LayerEvidence;
  layer: ScoreLayer;
  dimensions: Record<Dimension, DimensionScore>;
  gates?: GateApplied[];
  defaultOpen?: boolean;
  className?: string;
  /** Expanded modal view — show full breakdown without inner collapse */
  expanded?: boolean;
  /** Called when user taps the bottom fold control (modal). */
  onCollapse?: () => void;
  /** Layer card root — scroll here after inline collapse. */
  scrollTargetRef?: RefObject<HTMLDivElement | null>;
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return `${s.slice(0, max).trim()}…`;
}

export function LayerEvidencePanel({
  evidence,
  layer,
  dimensions,
  gates,
  defaultOpen = false,
  className,
  expanded = false,
  onCollapse,
  scrollTargetRef,
}: LayerEvidencePanelProps) {
  const [open, setOpen] = useState(defaultOpen || expanded);
  const showBody = expanded || open;

  const scrollCardToBottom = useCallback(() => {
    const el = scrollTargetRef?.current;
    if (!el) return;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        el.scrollIntoView({ behavior: 'smooth', block: 'end', inline: 'nearest' });
      });
    });
  }, [scrollTargetRef]);

  const handleCollapse = useCallback(() => {
    if (expanded) {
      onCollapse?.();
      return;
    }
    setOpen(false);
    scrollCardToBottom();
  }, [expanded, onCollapse, scrollCardToBottom]);
  const pages = evidence.pagesAudited ?? [];
  const extraPages = pages.length > 5 ? pages.length - 5 : 0;

  return (
    <div className={cn(expanded ? 'space-y-4' : 'mt-3 border-t border-border-subtle/60 pt-3', className)}>
      {!expanded && (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex w-full items-center justify-between gap-2 text-left group"
          aria-expanded={open}
        >
          <span className="text-[11px] font-medium text-fg-muted group-hover:text-fg transition-colors">
            More details
          </span>
          <ChevronDown
            className={cn(
              'h-3.5 w-3.5 shrink-0 text-fg-subtle transition-transform',
              open && 'rotate-180',
            )}
          />
        </button>
      )}

      {showBody && (
        <div className={cn('space-y-4', expanded ? '' : 'mt-2.5', 'text-[11px] leading-relaxed text-fg-muted')}>
          <section>
            <h4 className="text-[10px] font-semibold uppercase tracking-wider text-fg-subtle mb-1">
              What we looked at
            </h4>
            <p>{evidence.methodology}</p>
          </section>

          {pages.length > 0 && (
            <section>
              <h4 className="text-[10px] font-semibold uppercase tracking-wider text-fg-subtle mb-1">
                Pages analyzed
              </h4>
              <ul className="list-disc list-inside space-y-0.5 font-mono text-[10px]">
                {pages.slice(0, expanded ? 12 : 5).map((p) => (
                  <li key={p}>{p}</li>
                ))}
                {!expanded && extraPages > 0 && (
                  <li className="list-none text-fg-subtle">+{extraPages} more</li>
                )}
              </ul>
            </section>
          )}

          {evidence.crawlFindings.length > 0 && (
            <section>
              <h4 className="text-[10px] font-semibold uppercase tracking-wider text-fg-subtle mb-1">
                On your site
              </h4>
              <ul className="space-y-1">
                {evidence.crawlFindings.map((item, i) => (
                  <li key={`crawl-${i}`} className="min-w-0">
                    {item.url ? (
                      <a
                        href={item.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-accent hover:underline break-all"
                      >
                        {item.label}
                        <ExternalLink className="h-3 w-3 shrink-0" />
                      </a>
                    ) : (
                      <span className="text-fg">{item.label}</span>
                    )}
                    {item.detail && (
                      <span className="block text-fg-subtle mt-0.5">{item.detail}</span>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {(evidence.externalFindings.length > 0 ||
            (evidence.searchQueries && evidence.searchQueries.length > 0)) && (
            <section>
              <h4 className="text-[10px] font-semibold uppercase tracking-wider text-fg-subtle mb-1">
                Elsewhere
              </h4>
              {evidence.externalFindings.length > 0 && (
                <ul className="space-y-1 mb-2">
                  {evidence.externalFindings.map((item, i) => (
                    <li key={`ext-${i}`} className="text-fg">
                      {item.label}
                      {item.detail && (
                        <span className="block text-fg-subtle">{item.detail}</span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              {evidence.searchQueries && evidence.searchQueries.length > 0 && (
                <ul className="space-y-2">
                  {evidence.searchQueries.map((sq) => (
                    <li key={sq.query} className="min-w-0">
                      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                        <code className="text-[10px] px-1.5 py-0.5 rounded bg-bg-muted border border-border-subtle text-fg break-all">
                          {sq.query}
                        </code>
                        <span className="text-fg-subtle text-[10px]">
                          ({sq.resultCount} result{sq.resultCount === 1 ? '' : 's'})
                        </span>
                      </div>
                      {sq.topHits.length > 0 && (
                        <ul className="mt-1 ml-1 space-y-1 border-l border-border-subtle pl-2">
                          {sq.topHits.slice(0, expanded ? 5 : 3).map((hit) => (
                            <li key={hit.link} className="min-w-0">
                              <a
                                href={hit.link}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-accent hover:underline break-all text-[10px]"
                              >
                                {truncate(hit.link.replace(/^https?:\/\/(www\.)?/, ''), 72)}
                              </a>
                              {hit.snippet && (
                                <p className="text-fg-subtle mt-0.5">
                                  {truncate(hit.snippet, expanded ? 220 : 140)}
                                </p>
                              )}
                            </li>
                          ))}
                        </ul>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          <section>
            <h4 className="text-[10px] font-semibold uppercase tracking-wider text-fg-subtle mb-2">
              How we calculated this score
            </h4>
            <LayerScoringBreakdown layer={layer} dimensions={dimensions} gates={gates} />
          </section>

          <FoldControl onClick={handleCollapse} label={expanded ? 'Close' : 'Show less'} />
        </div>
      )}
    </div>
  );
}

function FoldControl({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center justify-center gap-1.5 pt-3 mt-1 border-t border-border-subtle/50 text-fg-subtle hover:text-fg transition-colors group"
      aria-label={label}
    >
      <ChevronDown
        className="h-4 w-4 shrink-0 rotate-180 transition-transform group-hover:-translate-y-0.5"
        aria-hidden
      />
      <span className="text-[10px] font-medium">{label}</span>
    </button>
  );
}
