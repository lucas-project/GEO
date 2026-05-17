'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Activity } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api-client';
import { canonicalPageUrl } from '@/lib/website-url';
import { pageSelectionKey } from '@/features/audit/audit-page-picker';
import type { SiteMonitorStatus } from '@modules/monitoring';

interface WatchSitePromptProps {
  siteId: string;
  url: string;
  /** Pages audited in this report — pre-selected for monitoring. */
  defaultPageUrls?: string[];
}

function defaultSelection(siteUrl: string, pageUrls: string[]): Set<string> {
  const keys = pageUrls.map((u) => pageSelectionKey(u, siteUrl));
  if (keys.length === 0) keys.push(pageSelectionKey(siteUrl, siteUrl));
  return new Set(keys);
}

export function WatchSitePrompt({ siteId, url, defaultPageUrls = [] }: WatchSitePromptProps) {
  const queryClient = useQueryClient();
  const [dismissed, setDismissed] = useState(false);
  const [showPages, setShowPages] = useState(false);

  const pageOptions = useMemo(() => {
    const seen = new Set<string>();
    const out: { key: string; label: string }[] = [];
    const add = (pageUrl: string, label?: string) => {
      const key = pageSelectionKey(pageUrl, url);
      if (seen.has(key)) return;
      seen.add(key);
      try {
        const path = new URL(key).pathname;
        out.push({ key, label: label ?? (path === '/' ? 'Homepage' : path) });
      } catch {
        out.push({ key, label: label ?? pageUrl });
      }
    };
    for (const u of defaultPageUrls) add(u);
    if (out.length === 0) add(url, 'Homepage');
    return out;
  }, [defaultPageUrls, url]);

  const [selected, setSelected] = useState<Set<string>>(() =>
    defaultSelection(url, defaultPageUrls.length > 0 ? defaultPageUrls : [url]),
  );

  useEffect(() => {
    setSelected(defaultSelection(url, defaultPageUrls.length > 0 ? defaultPageUrls : [url]));
  }, [url, defaultPageUrls]);

  const { data: status, isLoading: statusLoading } = useQuery<SiteMonitorStatus>({
    queryKey: ['monitor-status', siteId],
    queryFn: () => api.get(`/api/monitor/status?siteId=${encodeURIComponent(siteId)}`),
  });

  const addMonitor = useMutation({
    mutationFn: (pageUrls: string[]) =>
      api.post('/api/monitor', {
        url,
        siteId,
        monitorSchedulePreset: 'daily',
        monitorIntervalHours: 24,
        monitorPageUrls: pageUrls,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['monitor'] });
      queryClient.invalidateQueries({ queryKey: ['monitor-status', siteId] });
      queryClient.invalidateQueries({ queryKey: ['recent-audits'] });
    },
  });

  const togglePage = (key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        if (next.size <= 1) return prev;
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  if (dismissed) return null;

  if (statusLoading) return null;

  const isActive = status?.monitored && status.monitorEnabled;

  if (isActive) return null;

  const selectedUrls = [...selected].map((key) => canonicalPageUrl(key, url));

  return (
    <Card className="mb-6 border-accent/30 bg-accent/5">
      <CardContent className="py-4 space-y-3">
        <div className="flex items-start gap-3 min-w-0">
          <Activity className="w-5 h-5 text-accent shrink-0 mt-0.5" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-fg">Keep watching this site?</p>
            <p className="text-xs text-fg-muted mt-0.5">
              Enable daily monitoring to catch GEO score drops, schema loss, and new issues
              automatically.
            </p>
          </div>
        </div>

        {(showPages || pageOptions.length > 1) && (
          <div className="rounded-md border border-border-subtle bg-bg/80 p-3 space-y-2">
            <p className="text-[12px] uppercase tracking-wider text-fg-subtle">
              Pages to monitor
            </p>
            <ul className="space-y-1.5 max-h-40 overflow-auto">
              {pageOptions.map(({ key, label }) => (
                <li key={key}>
                  <label className="flex items-center gap-2 text-xs text-fg cursor-pointer">
                    <input
                      type="checkbox"
                      className="rounded border-border"
                      checked={selected.has(key)}
                      onChange={() => togglePage(key)}
                    />
                    <span className="truncate">{label}</span>
                  </label>
                </li>
              ))}
            </ul>
            <p className="text-[12px] text-fg-subtle">
              Defaults to the pages you audited. At least one page is required.
            </p>
          </div>
        )}

        <div className="flex items-center justify-end gap-2 flex-wrap">
          <Button variant="ghost" size="sm" onClick={() => setDismissed(true)}>
            Not now
          </Button>
          {pageOptions.length > 1 && !showPages && (
            <Button variant="outline" size="sm" onClick={() => setShowPages(true)}>
              Choose pages
            </Button>
          )}
          <Button
            size="sm"
            disabled={addMonitor.isPending || selectedUrls.length === 0}
            onClick={() => addMonitor.mutate(selectedUrls)}
          >
            {addMonitor.isPending ? 'Enabling…' : `Enable daily monitoring · ${selectedUrls.length} page${selectedUrls.length !== 1 ? 's' : ''}`}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
