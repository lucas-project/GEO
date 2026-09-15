'use client';

import { Globe, Loader2 } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useWorkspaceTarget } from '@/features/workspace/workspace-target-context';
import { normalizeAuditSiteUrl, useGeoAuditJob } from './geo-audit-job-context';
import { AuditPagePicker, selectedPageUrls } from './audit-page-picker';

export function AuditEntry({ initialUrl }: { initialUrl?: string }) {
  const { targetUrl, setTargetUrl, hydrated } = useWorkspaceTarget();
  const appliedUrl = useRef<string | null>(null);
  useEffect(() => {
    if (hydrated && initialUrl && appliedUrl.current !== initialUrl) {
      appliedUrl.current = initialUrl;
      setTargetUrl(initialUrl);
    }
  }, [hydrated, initialUrl, setTargetUrl]);
  const {
    isRunning,
    isInterrupted,
    failedError,
    enqueueError,
    startAudit,
    cancelAudit,
    discovering,
    discoverError,
    discovered,
    discoverySiteUrl,
    selected,
    setSelected,
    findPages,
    clearPageDiscovery,
  } = useGeoAuditJob();

  const showDiscovery =
    discovered &&
    discoverySiteUrl &&
    discoverySiteUrl === normalizeAuditSiteUrl(targetUrl)
      ? discovered
      : null;

  const startAuditWithPages = () => {
    if (!targetUrl.trim() || !showDiscovery) return;
    const pageUrls = selectedPageUrls(showDiscovery.pages, selected, showDiscovery.url);
    startAudit(
      {
        url: targetUrl.trim(),
        pageUrls,
        maxPages: pageUrls.length,
        pageRankings: showDiscovery.pages
          .filter((p): p is typeof p & { geoScore: number } => p.geoScore != null)
          .map((p) => ({
            url: p.url,
            geoScore: p.geoScore,
            archetype: p.archetype,
            signals: p.signals,
            probed: p.probed,
          })),
      },
      targetUrl.trim(),
    );
  };

  const startHomepageOnly = () => {
    if (!targetUrl.trim()) return;
    const url = normalizeAuditSiteUrl(targetUrl);
    startAudit({ url, maxPages: 1, pageUrls: [url] }, url);
  };

  return (
    <Card className="p-6">
      <div className="space-y-4">
        <p className="text-[13px] text-fg-subtle leading-relaxed">
          Page discovery and audits continue in the background if you switch tabs. When discovery
          finishes, return to Audit to pick pages and start the run.
        </p>
        <div>
          <label className="flex items-center gap-2 text-xs font-medium text-fg-muted uppercase tracking-wider">
            <Globe className="w-3.5 h-3.5" />
            Target URL
          </label>
          <p className="text-[13px] text-fg-muted mt-1 mb-2">
            Find pages on your site, tick the ones you want, then start the audit.
          </p>
          <div className="flex gap-2 flex-wrap">
            <Input
              value={targetUrl}
              onChange={(e) => {
                setTargetUrl(e.target.value);
                clearPageDiscovery();
              }}
              placeholder="example.com"
              disabled={isRunning || discovering}
              autoFocus
              className="flex-1 min-w-[200px]"
            />
            <Button
              type="button"
              variant="outline"
              disabled={!targetUrl.trim() || discovering || isRunning}
              onClick={() => void findPages(targetUrl)}
            >
              {discovering ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Discovering & ranking pages…
                </>
              ) : (
                'Find pages'
              )}
            </Button>
          </div>
        </div>

        {showDiscovery && (
          <AuditPagePicker
            siteUrl={targetUrl}
            discovery={showDiscovery}
            selected={selected}
            onSelectedChange={setSelected}
            disabled={isRunning}
            onStart={startAuditWithPages}
            startLoading={isRunning}
          />
        )}

        {!showDiscovery && !discovering && (
          <Button
            type="button"
            variant="ghost"
            className="text-xs text-fg-muted"
            disabled={!targetUrl.trim() || isRunning}
            onClick={startHomepageOnly}
          >
            Skip page picker — audit homepage only
          </Button>
        )}
        {discovering && <div className="space-y-2" role="status"><p className="text-sm text-fg-muted">Reading sitemaps and ranking page candidates. Large sites can take several minutes. You can stop discovery and audit the homepage.</p><Button variant="outline" size="sm" onClick={clearPageDiscovery}>Stop page discovery</Button></div>}
      </div>

      {discoverError && (
        <div className="mt-3 p-3 rounded-lg bg-danger/10 border border-danger/30 text-xs text-danger">
          {discoverError}
        </div>
      )}

      {enqueueError && (
        <div className="mt-4 p-3 rounded-lg bg-danger/10 border border-danger/30 text-xs text-danger">
          {enqueueError.message}
        </div>
      )}

      {failedError && !isRunning && (
        <div className="mt-4 p-3 rounded-lg bg-danger/10 border border-danger/30 text-xs text-danger space-y-2">
          <p>{failedError}</p>
          <p className="text-fg-muted">
            {isInterrupted
              ? 'The dev server stopped or restarted while this audit was running. Start a new run.'
              : 'The site may require more time or the crawler was blocked. Try again or check the URL.'}
          </p>
        </div>
      )}

      {isRunning && (
        <div className="mt-4">
          <Button type="button" variant="outline" size="sm" onClick={() => void cancelAudit()}>
            Cancel audit
          </Button>
        </div>
      )}
    </Card>
  );
}
