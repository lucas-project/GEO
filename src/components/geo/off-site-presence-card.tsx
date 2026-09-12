'use client';

import { ExternalLink, Globe, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  PRESENCE_PLATFORMS,
  PLATFORM_LABELS,
  type PresencePlatform,
  type PresenceSignals,
} from '@modules/brand-presence';
import type { ScoringMeta } from '@modules/geo-audit';

interface OffSitePresenceCardProps {
  presenceSignals: PresenceSignals;
  offSiteScore: number;
  presenceProbe?: ScoringMeta['presenceProbe'];
  className?: string;
}

function scoreTextColor(score: number): string {
  if (score >= 80) return 'text-success';
  if (score >= 60) return 'text-warning';
  return 'text-danger';
}

export function OffSitePresenceCard({
  presenceSignals,
  offSiteScore,
  presenceProbe,
  className,
}: OffSitePresenceCardProps) {
  const probe = presenceProbe;
  const isSearchVerified = probe?.source === 'serper';
  const verifiedSet = new Set(
    (probe?.verifiedPlatforms ?? []) as PresencePlatform[],
  );

  return (
    <div
      className={cn(
        'rounded-xl border border-border-subtle bg-bg-elevated p-4 space-y-3',
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Globe className="h-4 w-4 text-accent shrink-0" />
            <h3 className="text-sm font-semibold text-fg">Beyond your website</h3>
            <span
              className={cn(
                'text-[10px] px-1.5 py-0.5 rounded border',
                isSearchVerified
                  ? 'border-accent/40 text-accent bg-accent/5'
                  : 'border-border-subtle text-fg-muted',
              )}
            >
              {isSearchVerified ? (
                <span className="inline-flex items-center gap-1">
                  <Search className="h-3 w-3" />
                  Search verified
                </span>
              ) : (
                'Crawl-only'
              )}
            </span>
          </div>
          <p className="text-[11px] text-fg-muted mt-1 leading-snug">
            Links on your site (footer/nav) plus optional external search when configured.
          </p>
        </div>
        <span
          className={cn('text-xl font-semibold tabular-nums shrink-0', scoreTextColor(offSiteScore))}
        >
          {offSiteScore}
        </span>
      </div>

      <ul className="space-y-1.5">
        {PRESENCE_PLATFORMS.map((platform) => {
          const entry = presenceSignals.platforms[platform];
          const searchVerified = verifiedSet.has(platform);
          const showLinked = entry.linked || searchVerified;
          return (
            <li
              key={platform}
              className="flex items-start justify-between gap-2 text-[11px] min-w-0"
            >
              <span className={showLinked ? 'text-fg' : 'text-fg-muted'}>
                {showLinked ? '✓' : '○'} {PLATFORM_LABELS[platform]}
                {searchVerified && !entry.linked && (
                  <span className="text-accent ml-1">(found via search)</span>
                )}
              </span>
              {entry.linked && entry.urls[0] && (
                <a
                  href={entry.urls[0]}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-0.5 text-accent hover:underline shrink-0 max-w-[55%] truncate"
                  title={entry.urls[0]}
                >
                  Link
                  <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </li>
          );
        })}
      </ul>

      {isSearchVerified && probe && (
        <div className="text-[10px] text-fg-subtle border-t border-border-subtle pt-2 space-y-1">
          {probe.redditMentionEstimate != null && probe.redditMentionEstimate > 0 && (
            <p>Reddit mentions (search estimate): ~{probe.redditMentionEstimate}</p>
          )}
          {probe.mediaMentions > 0 && <p>Authority media hits: {probe.mediaMentions}</p>}
          {probe.reviewProfilesFound.length > 0 && (
            <p>Review listings found: {probe.reviewProfilesFound.length}</p>
          )}
        </div>
      )}

      {presenceSignals.sameAsCount > 0 && (
        <p className="text-[10px] text-fg-subtle border-t border-border-subtle pt-2">
          Organization schema lists {presenceSignals.sameAsCount} sameAs profile
          {presenceSignals.sameAsCount === 1 ? '' : 's'}.
        </p>
      )}
    </div>
  );
}
