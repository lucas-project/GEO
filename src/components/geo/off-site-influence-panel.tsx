'use client';

import { useState } from 'react';
import { ExternalLink, Globe, TrendingUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PLATFORM_LABELS } from '@modules/brand-presence';
import type {
  CrossPlatformPost,
  FacebookPost,
  OffSitePresenceReport,
  PlatformId,
  PlatformProbeResult,
  PresenceInsights,
  RedditPost,
} from '@modules/off-site-presence';
import { PLATFORM_IDS, enforcePresenceEvidence, hasVerifiedProfile, isSearchDestination } from '@modules/off-site-presence';
import {
  inferMarketFromDomain,
  partitionRedditPostsByMarket,
} from '@modules/off-site-presence';

interface OffSiteInfluencePanelProps {
  report: OffSitePresenceReport;
  scannedAt?: string;
  className?: string;
}

function bandColor(band: OffSitePresenceReport['scores']['band']): string {
  if (band === 'excellent') return 'text-success';
  if (band === 'qualified') return 'text-warning';
  return 'text-danger';
}

function platformLabel(id: PlatformId): string {
  if (id === 'site_search') return 'Web search';
  return PLATFORM_LABELS[id as keyof typeof PLATFORM_LABELS] ?? id;
}

function userFacingStatus(p: PlatformProbeResult): string {
  if (p.status === 'ok') return 'Profile found';
  if (p.status === 'skipped') return 'Not checked';
  if (p.status === 'unclaimed') return 'Listing unclaimed';
  if (p.status === 'limited_data') {
    return p.signals.profileExists ? 'Partial listing data' : 'Limited visibility';
  }
  if (p.status === 'captcha_blocked') return 'Site blocked automated checks';
  if (p.status === 'unreachable') return 'Could not verify';
  return p.status;
}

function platformDetailLines(
  id: PlatformId,
  p: PlatformProbeResult,
  report: OffSitePresenceReport,
  insights?: PresenceInsights,
): string[] {
  const lines: string[] = [];
  if (id === 'reddit') {
    const onTopic = report?.engagement.redditDisplayPosts?.length ?? 0;
    if (onTopic > 0) {
      lines.push(`${onTopic} on-topic thread${onTopic === 1 ? '' : 's'}`);
      const subs = p.subreddits?.slice(0, 5);
      if (subs?.length) {
        lines.push(`Communities: ${subs.map((s) => `r/${s}`).join(', ')}`);
      }
    } else if (p.signals.profileExists) {
      lines.push('Profile or community found; no on-topic threads matched your keywords');
    }
  }
  if (id === 'quora') {
    if ((p.signals.answerCount ?? 0) > 0) {
      lines.push(`${p.signals.answerCount} answers found`);
    }
    const questions = insights?.discoveries.quoraQuestions?.slice(0, 3) ?? [];
    for (const q of questions) {
      if (q.title) lines.push(`Question: ${q.title}`);
    }
    const evidence = (p.raw as { searchEvidence?: { title?: string }[] } | undefined)
      ?.searchEvidence;
    if (evidence?.length && questions.length === 0) {
      for (const e of evidence.slice(0, 2)) {
        if (e.title) lines.push(`From search: ${e.title}`);
      }
    }
  }
  if (id === 'trustpilot') {
    const summary = insights?.discoveries.trustpilotSummary;
    if (summary?.rating != null) lines.push(`Rating: ${summary.rating}★`);
    else if (p.signals.rating != null) lines.push(`Rating: ${p.signals.rating}★`);
    const reviews = summary?.reviewCount ?? p.signals.reviewCount;
    if (reviews) lines.push(`${reviews} reviews`);
    if (summary?.unclaimed ?? p.signals.unclaimed) {
      lines.push('Listing may be unclaimed — claim it on Trustpilot');
    } else {
      lines.push('Listing appears claimed');
    }
    const evidence = (p.raw as { searchEvidence?: { title?: string }[] } | undefined)
      ?.searchEvidence;
    if (evidence?.length && p.status === 'limited_data') {
      for (const e of evidence.slice(0, 2)) {
        if (e.title) lines.push(`Search snippet: ${e.title}`);
      }
    }
  }
  if (id === 'g2' || id === 'capterra') {
    if (p.signals.reviewCount) lines.push(`${p.signals.reviewCount} reviews`);
    if (p.signals.rating != null) lines.push(`Rating: ${p.signals.rating}★`);
  }
  if (id === 'site_search' && p.signals.searchHitEstimate) {
    lines.push(`~${p.signals.searchHitEstimate} off-site search hits`);
  }
  return lines;
}

function skipReason(id: PlatformId, report: OffSitePresenceReport): string | undefined {
  return (
    report.meta.searchPlan?.skipPlatforms.find((s) => s.id === id)?.reason ??
    (id === 'g2' || id === 'capterra'
      ? 'Software review sites do not apply to this brand category.'
      : undefined)
  );
}

function groupPlatforms(report: OffSitePresenceReport) {
  const found: Array<{ id: PlatformId; p: PlatformProbeResult }> = [];
  const unverified: Array<{ id: PlatformId; p: PlatformProbeResult }> = [];
  const skipped: Array<{ id: PlatformId; p: PlatformProbeResult; reason?: string }> = [];

  for (const id of PLATFORM_IDS) {
    const p = report.platforms[id];
    if (!p) continue;
    if (p.status === 'skipped') {
      skipped.push({ id, p, reason: skipReason(id, report) });
    } else if (
      p.status === 'ok' ||
      p.status === 'limited_data' ||
      p.status === 'unclaimed'
    ) {
      found.push({ id, p });
    } else {
      unverified.push({ id, p });
    }
  }

  return { found, unverified, skipped };
}

function DimensionBar({
  label,
  score,
  max,
  narrative,
  bullets,
}: {
  label: string;
  score: number;
  max: number;
  narrative: string;
  bullets: string[];
}) {
  const pct = max > 0 ? Math.min(100, Math.round((score / max) * 100)) : 0;
  return (
    <div className="rounded-lg bg-bg-muted/50 p-3 space-y-2">
      <div className="flex justify-between items-baseline gap-2">
        <span className="text-sm font-medium text-fg">{label}</span>
        <span className="text-sm font-semibold tabular-nums text-fg">
          {score}
          <span className="text-fg-muted font-normal text-xs">/{max}</span>
        </span>
      </div>
      <div className="w-full h-1.5 rounded-full bg-border overflow-hidden">
        <div className="h-full bg-accent transition-all" style={{ width: `${pct}%` }} />
      </div>
      <p className="text-xs text-fg-muted leading-snug">{narrative}</p>
      {bullets.length > 0 && (
        <ul className="space-y-0.5">
          {bullets.map((b, i) => (
            <li key={i} className="text-xs text-fg-subtle leading-snug">
              · {b}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const DISCUSSION_INITIAL = 10;

type DisplayDiscussion = RedditPost | FacebookPost | CrossPlatformPost;

function platformBadgeLabel(platform?: string): string {
  if (!platform) return 'Web';
  if (platform === 'x') return 'X';
  if (platform === 'xiaohongshu') return 'Xiaohongshu';
  return PLATFORM_LABELS[platform as keyof typeof PLATFORM_LABELS] ?? platform;
}

function WebSearchHitsList({
  hits,
}: {
  hits: Array<{ url: string; title?: string; platform?: string }>;
}) {
  const [expanded, setExpanded] = useState(false);
  const initial = 12;
  const visible = expanded ? hits : hits.slice(0, initial);
  const folded = Math.max(0, hits.length - initial);

  return (
    <>
      <ul className="space-y-2">
        {visible.map((hit) => (
          <li key={hit.url} className="text-sm leading-snug min-w-0">
            {hit.platform && (
              <span className="text-[10px] uppercase tracking-wide text-fg-subtle mr-1.5">
                {platformBadgeLabel(hit.platform)}
              </span>
            )}
            <a
              href={hit.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent hover:underline font-medium"
            >
              {hit.title?.trim() || hit.url}
            </a>
          </li>
        ))}
      </ul>
      {folded > 0 && (
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="mt-2 text-xs text-accent hover:underline"
        >
          {expanded ? 'Show fewer' : `Show ${folded} more search results`}
        </button>
      )}
    </>
  );
}

function AgentReachSetupHint({
  agentReach,
  shortfall,
}: {
  agentReach?: OffSitePresenceReport['engagement']['agentReach'];
  shortfall: number;
}) {
  if (!agentReach || shortfall <= 0) return null;
  if (agentReach.xhs !== 'auth' && agentReach.xhs !== 'missing') return null;
  return (
    <p className="text-xs text-fg-subtle mb-2 leading-relaxed">
      Install <code className="text-xs">xiaohongshu-cli</code> and run{' '}
      <code className="text-xs">xhs login</code> once on this machine to unlock native Xiaohongshu
      search (see <code className="text-xs">docs/agent-reach-presence.md</code>).
    </p>
  );
}

function DiscussionShortfallBanner({
  shown,
  target,
  platformLabel,
}: {
  shown: number;
  target: number;
  platformLabel: string;
}) {
  const shortfall = Math.max(0, target - shown);
  if (shortfall <= 0) return null;
  return (
    <p className="text-xs text-warning mb-2 leading-relaxed">
      Showing {shown} of {target} target {platformLabel} threads. Search was widened across Reddit,
      Facebook, X, TikTok, Xiaohongshu (小红书), Zhihu, Amazon, and more; fewer results matched your
      brand or keywords. Non-English titles are included.
    </p>
  );
}

function DiscussionPostItem({
  post,
  platform,
}: {
  post: DisplayDiscussion;
  platform: 'reddit' | 'facebook' | 'cross';
}) {
  const isReddit = platform === 'reddit';
  const isCross = platform === 'cross';
  const reddit = isReddit ? (post as RedditPost) : null;
  const facebook = platform === 'facebook' ? (post as FacebookPost) : null;
  const cross = isCross ? (post as CrossPlatformPost) : null;
  const crossLabel =
    cross &&
    (PLATFORM_LABELS[cross.platform as keyof typeof PLATFORM_LABELS] ?? cross.platform);

  return (
    <li className="text-sm leading-snug">
      <div className="flex items-start justify-between gap-2">
        {post.url ? (
          <a
            href={post.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm font-medium text-fg hover:text-accent hover:underline min-w-0"
          >
            {post.title}
          </a>
        ) : (
          <span className="text-sm font-medium text-fg min-w-0">{post.title}</span>
        )}
        {crossLabel && (
          <span className="text-[10px] uppercase tracking-wide text-fg-subtle shrink-0">
            {crossLabel}
          </span>
        )}
        {post.valueScore != null && post.valueScore > 0 && (
          <span className="text-xs tabular-nums text-fg-subtle shrink-0">{post.valueScore} pts</span>
        )}
      </div>
      {(reddit && (reddit.upvotes > 0 || reddit.comments > 0)) ||
      (facebook && (facebook.likes > 0 || facebook.comments > 0)) ? (
        <span className="text-fg-subtle text-xs block mt-0.5">
          {reddit && (
            <>
              {reddit.upvotes.toLocaleString()} upvotes · {reddit.comments.toLocaleString()} comments
              {reddit.subreddit ? ` · r/${reddit.subreddit}` : ''}
            </>
          )}
          {facebook && (
            <>
              {facebook.likes.toLocaleString()} likes · {facebook.comments.toLocaleString()} comments
            </>
          )}
        </span>
      ) : null}
    </li>
  );
}

function SimpleDiscussionList({
  title,
  subtitle,
  posts,
  shortfall,
  target,
  platformLabel,
}: {
  title: string;
  subtitle: string;
  posts: CrossPlatformPost[];
  shortfall: number;
  target: number;
  platformLabel: string;
}) {
  const [expanded, setExpanded] = useState(false);
  if (posts.length === 0) return null;
  const visible = expanded ? posts : posts.slice(0, DISCUSSION_INITIAL);
  const foldedCount = Math.max(0, posts.length - DISCUSSION_INITIAL);

  return (
    <div>
      <div className="flex items-center gap-1 text-xs uppercase tracking-wider text-fg-subtle mb-0.5">
        <TrendingUp className="h-3 w-3" />
        {title}
      </div>
      <p className="text-xs text-fg-subtle mb-2">{subtitle}</p>
      {shortfall > 0 && (
        <DiscussionShortfallBanner
          shown={posts.length}
          target={target}
          platformLabel={platformLabel}
        />
      )}
      <ul className="space-y-2">
        {visible.map((post) => (
          <DiscussionPostItem key={post.url ?? post.title} post={post} platform="cross" />
        ))}
      </ul>
      {foldedCount > 0 && (
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="mt-2 text-xs text-accent hover:underline"
        >
          {expanded ? 'Show fewer' : `Show ${foldedCount} more`}
        </button>
      )}
    </div>
  );
}

function DiscussionList({
  title,
  subtitle,
  posts,
  platform,
  marketMeta,
  marketForSort,
  displayTarget,
  displayShortfall,
}: {
  title: string;
  subtitle: string;
  posts: DisplayDiscussion[];
  platform: 'reddit' | 'facebook';
  marketMeta?: OffSitePresenceReport['meta']['marketCountry'];
  marketForSort: ReturnType<typeof inferMarketFromDomain>;
  displayTarget?: number;
  displayShortfall?: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const { primary, other } = partitionRedditPostsByMarket(posts, marketForSort);
  const foldedCount =
    Math.max(0, primary.length - DISCUSSION_INITIAL) + other.length;
  const visiblePrimary = expanded ? primary : primary.slice(0, DISCUSSION_INITIAL);
  const visibleOther = expanded ? other : [];

  if (posts.length === 0) return null;

  return (
    <div>
      <div className="flex items-center gap-1 text-xs uppercase tracking-wider text-fg-subtle mb-0.5">
        <TrendingUp className="h-3 w-3" />
        {title}
      </div>
      <p className="text-xs text-fg-subtle mb-2">{subtitle}</p>
      {platform === 'reddit' && (displayShortfall ?? 0) > 0 && (
        <DiscussionShortfallBanner
          shown={posts.length}
          target={displayTarget ?? 10}
          platformLabel="Reddit"
        />
      )}
      <ul className="space-y-2">
        {visiblePrimary.map((post) => (
          <DiscussionPostItem
            key={post.url ?? post.title}
            post={post}
            platform={platform}
          />
        ))}
      </ul>
      {expanded && visibleOther.length > 0 && (
        <div className="mt-3">
          <p className="text-xs text-fg-subtle mb-1.5">
            Other regions ({visibleOther.length})
          </p>
          <ul className="space-y-2 opacity-90">
            {visibleOther.map((post) => (
              <DiscussionPostItem
                key={post.url ?? post.title}
                post={post}
                platform={platform}
              />
            ))}
          </ul>
        </div>
      )}
      {foldedCount > 0 && (
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="mt-2 text-xs text-accent hover:underline"
        >
          {expanded
            ? 'Show fewer'
            : `Show ${foldedCount} more${foldedCount === 1 ? '' : ''}${
                marketMeta && other.length > 0
                  ? ` (${other.length} outside ${marketMeta.name})`
                  : ''
              }`}
        </button>
      )}
    </div>
  );
}

export function OffSiteInfluencePanel({
  report,
  scannedAt,
  className,
}: OffSiteInfluencePanelProps) {
  const safe = enforcePresenceEvidence(report);
  return safe.scores.total == null ? <PresenceEvidencePanel report={safe} className={className} /> : <LegacyOffSiteInfluencePanel report={safe} scannedAt={scannedAt} className={className} />;
}

function PresenceEvidencePanel({ report: raw, className }: OffSiteInfluencePanelProps) {
  const report = enforcePresenceEvidence(raw);
  return <div className={cn('rounded-xl border border-border bg-bg-elevated p-4 space-y-4', className)}>
    <h3 className="font-semibold">Off-site evidence for {report.entity.primaryBrand}</h3>
    <p role="status" className="text-sm text-fg-muted">Insufficient evidence to rate visibility. Citation frequency: Not measured.</p>
    <p className="text-xs text-fg-muted">Inferred category: {report.meta.searchPlan?.category?.replace(/_/g, ' ') ?? 'Not classified'}. Confirm the target profile before using industry-specific recommendations.</p>
    <ul className="space-y-3">{Object.values(report.platforms).map(p => <li key={p.platform} className="border-t border-border pt-3 text-sm break-words">
      <strong>{p.platform.replace(/_/g, ' ')}</strong> · {hasVerifiedProfile(p) ? 'Verified profile' : p.evidence?.observation === 'observed' ? p.evidence.identityMatch ? 'Brand matched on retrieved page' : 'Retrieved page: no identity match' : p.evidence?.observation === 'unknown' ? 'Unverified source' : p.evidence?.observation?.replace(/_/g, ' ')}
      {p.evidence?.excerpt && <blockquote className="mt-1 text-fg-muted">{p.evidence.excerpt}</blockquote>}
      {p.evidence?.capturedAt && <p className="text-xs text-fg-muted">Captured {new Date(p.evidence.capturedAt).toLocaleString()}</p>}
      {p.url && <a className="block text-accent hover:underline" href={p.url} target="_blank" rel="noopener noreferrer">{isSearchDestination(p.url) ? 'Search this platform' : 'Open source'}</a>}
    </li>)}</ul>
  </div>;
}

function LegacyOffSiteInfluencePanel({ report, scannedAt, className }: OffSiteInfluencePanelProps) {
  if (report.scores.total == null) return null;
  const { entity, scores, engagement, recommendations, insights } = report;
  if (scores.total == null || scores.reviews == null || scores.community == null || scores.media == null) return null;
  const groups = groupPlatforms(report);
  const displayThreads = engagement.redditDisplayPosts ?? [];
  const facebookPosts = engagement.facebookDisplayPosts ?? [];
  const crossPlatformPosts = engagement.crossPlatformDisplayPosts ?? [];
  const marketMeta = report.meta.marketCountry;
  const marketForSort = inferMarketFromDomain(report.meta.domain);
  const threadSubtitle = marketMeta
    ? `Ranked by relevance (brand first, then engagement), prioritized for ${marketMeta.name}.`
    : 'Ranked by relevance — brand mention, keywords, then likes and comments.';
  const socialProfiles = insights?.discoveries.socialProfiles ?? [];
  const profileLinks = socialProfiles.slice(0, 8);
  const webSearchHits = insights?.discoveries.topSearchHits ?? [];

  const headline = insights?.headline ?? `Off-site influence for ${entity.primaryBrand}`;
  const verdict = insights?.verdict;

  return (
    <div
      className={cn(
        'rounded-xl border border-border-subtle bg-bg-elevated p-4 space-y-5',
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Globe className="h-4 w-4 text-accent shrink-0" />
            <h3 className="text-sm font-semibold text-fg">{headline}</h3>
          </div>
          <p className="text-sm text-fg-muted mt-1">
            Brand: <strong className="text-fg">{entity.primaryBrand}</strong>
            {entity.needsReview && (
              <span className="text-warning ml-1">· confirm entity</span>
            )}
            {scannedAt && (
              <span className="text-fg-subtle"> · {new Date(scannedAt).toLocaleString()}</span>
            )}
          </p>
          <p className="text-xs text-fg-subtle mt-1">
            {scores.total != null && scores.total < 50
              ? 'Below 50/100 — AI may rarely cite you as an off-site authority.'
              : scores.total != null && scores.total >= 75
                ? '75+ — strong off-site signals for AI answers.'
                : '50–74 — credible footprint; improve weakest dimension below.'}
          </p>
        </div>
        <div className="text-right shrink-0">
          <div className={cn('text-2xl font-semibold tabular-nums', bandColor(scores.band))}>
            {scores.total}
            <span className="text-sm text-fg-muted font-normal">/100</span>
          </div>
          <div className="text-xs text-fg-subtle capitalize">{scores.band.replace(/_/g, ' ')}</div>
        </div>
      </div>

      {verdict && (
        <p className="text-[12px] text-fg leading-relaxed border-l-2 border-accent/40 pl-3">{verdict}</p>
      )}

      {insights && (
        <div className="grid gap-2 sm:grid-cols-3">
          <DimensionBar
            label="Review sites"
            score={insights.dimensions.reviews.score}
            max={insights.dimensions.reviews.max}
            narrative={insights.dimensions.reviews.narrative}
            bullets={insights.dimensions.reviews.bullets}
          />
          <DimensionBar
            label="Communities & social"
            score={insights.dimensions.community.score}
            max={insights.dimensions.community.max}
            narrative={insights.dimensions.community.narrative}
            bullets={insights.dimensions.community.bullets}
          />
          <DimensionBar
            label="News & references"
            score={insights.dimensions.media.score}
            max={insights.dimensions.media.max}
            narrative={insights.dimensions.media.narrative}
            bullets={insights.dimensions.media.bullets}
          />
        </div>
      )}

      {insights && (insights.strengths.length > 0 || insights.gaps.length > 0) && (
        <section className="grid gap-3 sm:grid-cols-2">
          {insights.strengths.length > 0 && (
            <div className="rounded-lg border border-success/25 bg-success/5 p-3">
              <h4 className="text-xs uppercase tracking-wider text-success font-semibold mb-1.5">
                Strengths
              </h4>
              <ul className="space-y-1.5">
                {insights.strengths.map((s, i) => (
                  <li key={i} className="text-sm">
                    <span className="font-medium text-fg">{s.title}</span>
                    <span className="text-fg-muted"> — {s.detail}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {insights.gaps.length > 0 && (
            <div className="rounded-lg border border-warning/25 bg-warning/5 p-3">
              <h4 className="text-xs uppercase tracking-wider text-warning font-semibold mb-1.5">
                Gaps to address
              </h4>
              <ul className="space-y-1.5">
                {insights.gaps.map((g, i) => (
                  <li key={i} className="text-sm">
                    <span className="font-medium text-fg">{g.title}</span>
                    <span className="text-fg-muted"> — {g.detail}</span>
                    {g.suggestedAction && (
                      <span className="block text-xs text-fg-subtle mt-0.5">{g.suggestedAction}</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      {groups.found.length > 0 && (
        <section>
          <h4 className="text-xs uppercase tracking-wider text-fg-subtle mb-1.5">
            Where we found you
          </h4>
          <ul className="space-y-1.5">
            {groups.found.map(({ id, p }) => {
              const details = platformDetailLines(id, p, report, insights);
              return (
                <li
                  key={id}
                  className="flex items-start justify-between gap-2 text-sm min-w-0 rounded-lg bg-bg-muted/30 px-2 py-2"
                >
                  <span className="min-w-0">
                    <span className="text-fg font-medium">{platformLabel(id)}</span>
                    <span className="text-fg-muted block text-xs">{userFacingStatus(p)}</span>
                    {details.map((d, i) => (
                      <span key={i} className="text-fg-subtle block text-xs">
                        {d}
                      </span>
                    ))}
                  </span>
                  {p.url && (
                    <a
                      href={p.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-0.5 text-accent hover:underline shrink-0 mt-0.5"
                    >
                      Open
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {groups.unverified.length > 0 && (
        <section>
          <h4 className="text-xs uppercase tracking-wider text-fg-subtle mb-1.5">
            Could not verify
          </h4>
          <ul className="space-y-1">
            {groups.unverified.map(({ id, p }) => (
              <li key={id} className="text-sm text-fg-muted">
                <span className="text-fg">{platformLabel(id)}</span>
                <span className="text-fg-subtle"> — {userFacingStatus(p)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {webSearchHits.length > 0 && (
        <section>
          <h4 className="text-xs uppercase tracking-wider text-fg-subtle mb-1.5">
            Web search results
          </h4>
          <p className="text-xs text-fg-subtle mb-2">
            Links found via Bing/SERP and optional xhs-cli ({webSearchHits.length} total). On-topic
            threads above are ranked separately; this lists everything discovered.
          </p>
          <WebSearchHitsList hits={webSearchHits} />
        </section>
      )}

      {insights?.discoveries && (
        <section className="space-y-3">
          <h4 className="text-xs uppercase tracking-wider text-fg-subtle">Discoveries</h4>
          {insights.discoveries.mediaDomains && insights.discoveries.mediaDomains.length > 0 && (
            <p className="text-sm text-fg-muted">
              <span className="text-fg">Domains in search results:</span>{' '}
              {insights.discoveries.mediaDomains.slice(0, 8).join(', ')}
            </p>
          )}
          {insights.discoveries.verticalSources &&
            insights.discoveries.verticalSources.length > 0 && (
              <div>
                <p className="text-sm text-fg-muted mb-1">
                  <span className="text-fg font-medium">Industry-specific sources</span>
                </p>
                <ul className="space-y-1.5">
                  {insights.discoveries.verticalSources.map((src) => (
                    <li key={src.id} className="flex items-center justify-between gap-2 text-sm">
                      <span className="truncate text-fg min-w-0">
                        {src.label}
                        {src.title && (
                          <span className="text-fg-muted block text-xs truncate">{src.title}</span>
                        )}
                      </span>
                      <a
                        href={src.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-accent hover:underline shrink-0"
                      >
                        Open
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}
        </section>
      )}

      {(displayThreads.length > 0 ||
        facebookPosts.length > 0 ||
        crossPlatformPosts.length > 0 ||
        profileLinks.length > 0) && (
        <section className="space-y-4">
          <DiscussionList
            title="On-topic Reddit threads"
            subtitle={threadSubtitle}
            posts={displayThreads}
            platform="reddit"
            marketMeta={marketMeta}
            marketForSort={marketForSort}
            displayTarget={engagement.redditDisplayTarget}
            displayShortfall={engagement.redditDisplayShortfall}
          />

          <DiscussionList
            title="On-topic Facebook discussions"
            subtitle={`${threadSubtitle} Reaction counts may be missing when only search snippets are available.`}
            posts={facebookPosts}
            platform="facebook"
            marketMeta={marketMeta}
            marketForSort={marketForSort}
          />

          <div>
            <AgentReachSetupHint
              agentReach={engagement.agentReach}
              shortfall={engagement.crossPlatformDisplayShortfall ?? 0}
            />
            <SimpleDiscussionList
              title="On-topic discussions (other platforms)"
              subtitle={`${threadSubtitle} Includes X, TikTok, Xiaohongshu (小红书), Zhihu, Amazon reviews, and similar — from country-aware web search and optional xhs-cli.`}
              posts={crossPlatformPosts}
              shortfall={engagement.crossPlatformDisplayShortfall ?? 0}
              target={engagement.crossPlatformDisplayTarget ?? 10}
              platformLabel="cross-platform"
            />
          </div>

          {profileLinks.length > 0 && (
            <div>
              <h4 className="text-xs uppercase tracking-wider text-fg-subtle mb-1.5">
                Social profiles
              </h4>
              <p className="text-xs text-fg-subtle mb-2">
                Official or discovered profile pages (review for ownership).
              </p>
              <ul className="space-y-2">
                {profileLinks.map((hit) => (
                  <li
                    key={hit.url}
                    className="flex items-start justify-between gap-2 text-sm min-w-0"
                  >
                    <span className="min-w-0">
                      <span className="text-fg font-medium">
                        {PLATFORM_LABELS[hit.platform as keyof typeof PLATFORM_LABELS] ??
                          hit.platform}
                      </span>
                      {hit.title && (
                        <span className="text-fg-muted block text-xs truncate">{hit.title}</span>
                      )}
                    </span>
                    <a
                      href={hit.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-accent hover:underline shrink-0"
                    >
                      Open
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      {insights?.gettingStarted && insights.gettingStarted.length > 0 && (
        <section className="rounded-lg border border-accent/20 bg-accent/5 p-3">
          <h4 className="text-xs uppercase tracking-wider text-accent font-semibold mb-2">
            Getting started
          </h4>
          <ol className="space-y-3">
            {insights.gettingStarted.map((block, i) => (
              <li key={i}>
                <div className="text-sm font-semibold text-fg">
                  {i + 1}. {block.title}
                  <span className="font-normal text-fg-muted"> ({block.priority})</span>
                </div>
                <p className="text-xs text-fg-subtle mt-0.5">{block.why}</p>
                <ul className="mt-1 space-y-0.5 list-disc list-inside text-xs text-fg-muted">
                  {block.steps.map((step, j) => (
                    <li key={j}>{step}</li>
                  ))}
                </ul>
              </li>
            ))}
          </ol>
        </section>
      )}

      {recommendations.length > 0 && (
        <section className="border-t border-border-subtle pt-3">
          <h4 className="text-xs uppercase tracking-wider text-fg-subtle mb-1.5">
            Recommendations
          </h4>
          <ul className="space-y-2">
            {recommendations.slice(0, 8).map((r, i) => (
              <li key={i} className="text-sm text-fg-muted leading-snug">
                <span
                  className={cn(
                    'text-[9px] uppercase font-semibold mr-1',
                    r.priority === 'high'
                      ? 'text-danger'
                      : r.priority === 'medium'
                        ? 'text-warning'
                        : 'text-fg-subtle',
                  )}
                >
                  {r.priority}
                </span>
                {r.category && (
                  <span className="text-[9px] text-fg-subtle mr-1">[{r.category}]</span>
                )}
                {r.text}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

