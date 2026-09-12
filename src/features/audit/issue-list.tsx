'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { IssueCard, type IssueSeverity } from '@/components/geo/issue-card';
import { cn } from '@/lib/utils';
import type { Issue } from '@modules/geo-audit/schemas';
import { expandReason } from '@modules/geo-audit/plain-language';
import { IssuePageEvidence } from './issue-page-evidence';

interface IssueListProps {
  auditId: string;
  issues: Issue[];
  auditUrl: string;
  dimensionLabels: Record<string, string>;
  /** Extra site URLs (audited + discovered) when issue.details is missing or sparse. */
  sitePageUrls?: string[];
}

function resolveDetails(issue: Issue, auditUrl: string, sitePageUrls: string[]) {
  if (issue.details) return issue.details;
  const reasons = issue.description
    ? issue.description.split(' · ').filter((r) => r.trim().length > 0)
    : [issue.title];
  const affectedUrls =
    sitePageUrls.length > 0 ? [...new Set([auditUrl, ...sitePageUrls])] : [auditUrl];
  return {
    affectedUrls,
    reasons: reasons.length > 0 ? reasons : [issue.title],
    recommendation: undefined,
    locations: undefined,
    impactedPages: undefined,
  };
}

export function IssueList({
  auditId,
  issues,
  auditUrl,
  dimensionLabels,
  sitePageUrls = [],
}: IssueListProps) {
  const [openId, setOpenId] = useState<string | null>(null);

  if (issues.length === 0) {
    return <p className="text-sm text-fg-muted">No critical issues found.</p>;
  }

  return (
    <div className="space-y-2">
      {issues.map((issue) => {
        const isOpen = openId === issue.id;
        const details = resolveDetails(issue, auditUrl, sitePageUrls);
        const dimensionLabel = dimensionLabels[issue.dimension] ?? issue.dimension;
        const impactedPages = details.impactedPages ?? [];

        return (
          <div key={issue.id} id={`issue-${issue.id}`} className="rounded-lg border border-border overflow-hidden scroll-mt-24">
            <button
              type="button"
              onClick={() => setOpenId(isOpen ? null : issue.id)}
              className={cn(
                'w-full text-left transition-colors',
                isOpen ? 'bg-bg-elevated' : 'bg-bg-elevated hover:bg-bg-subtle',
              )}
              aria-expanded={isOpen}
            >
              <div className="relative pr-10">
                <IssueCard
                  severity={issue.severity as IssueSeverity}
                  title={issue.title}
                  description={isOpen ? undefined : issue.description}
                  impact={isOpen ? undefined : issue.impact ?? undefined}
                  dimension={dimensionLabel}
                  className="border-0 rounded-none shadow-none"
                />
                <ChevronDown
                  className={cn(
                    'absolute right-4 top-5 h-4 w-4 text-fg-muted transition-transform',
                    isOpen && 'rotate-180',
                  )}
                />
              </div>
            </button>

            {isOpen && (
              <div className="border-t border-border bg-bg px-4 py-4 space-y-4 text-xs">
                {issue.summaryPlain && (
                  <div>
                    <h5 className="text-[12px] uppercase tracking-wider text-fg-subtle mb-2">What we found</h5>
                    <p className="text-fg-muted leading-relaxed">{issue.summaryPlain}</p>
                  </div>
                )}

                {issue.impact && (
                  <div>
                    <h5 className="text-[12px] uppercase tracking-wider text-fg-subtle mb-2">Why this matters</h5>
                    <p className="text-fg-muted leading-relaxed">{issue.impact}</p>
                  </div>
                )}

                {details.reasons.length > 0 && (
                  <div>
                    <h5 className="text-[12px] uppercase tracking-wider text-fg-subtle mb-2">
                      {issue.summaryPlain ? 'More detail' : 'Why this matters'}
                    </h5>
                    <ul className="space-y-1.5 text-fg-muted leading-relaxed list-disc pl-4">
                      {details.reasons.map((reason) => (
                        <li key={reason}>{expandReason(reason)}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {impactedPages.length > 0 ? (
                  <IssuePageEvidence
                    auditId={auditId}
                    impactedPages={impactedPages}
                    issueFixHint={details.recommendation}
                    issueDimension={issue.dimension}
                  />
                ) : (
                  details.affectedUrls.length > 0 && (
                    <div>
                      <h5 className="text-[12px] uppercase tracking-wider text-fg-subtle mb-2">Affected URLs</h5>
                      <ul className="space-y-1.5 text-fg-muted">
                        {details.affectedUrls.map((url) => (
                          <li key={url} className="break-all">{url}</li>
                        ))}
                      </ul>
                    </div>
                  )
                )}

                {details.locations && details.locations.length > 0 && impactedPages.length === 0 && (
                  <div>
                    <h5 className="text-[12px] uppercase tracking-wider text-fg-subtle mb-2">On-page locations</h5>
                    <ul className="space-y-1 text-fg-muted list-disc pl-4">
                      {details.locations.map((loc) => (
                        <li key={loc}>{loc}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {details.recommendation && (
                  <div className="rounded-md border border-border-subtle bg-bg-elevated p-3">
                    <h5 className="text-[12px] uppercase tracking-wider text-fg-subtle mb-1">What to do</h5>
                    <p className="text-fg-muted leading-relaxed">{details.recommendation}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
