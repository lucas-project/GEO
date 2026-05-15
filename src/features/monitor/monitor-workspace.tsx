'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Plus, Trash2, Play, Activity, TrendingDown, TrendingUp, Info } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScoreGauge } from '@/components/geo/score-gauge';
import { api } from '@/lib/api-client';
import { useWorkspaceTarget } from '@/features/workspace/workspace-target-context';
import { formatDate } from '@/lib/utils';

interface MonitoredSite {
  id: string;
  url: string;
  lastRunAt: string | null;
  lastScore: number | null;
  alertCount: number;
}

interface AlertItem {
  alert: {
    id: string;
    severity: 'info' | 'warning' | 'regression';
    title: string;
    detail: string | null;
    dimension: string | null;
    delta: number | null;
  };
  siteUrl: string;
  runAt: string;
}

export function MonitorWorkspace() {
  const queryClient = useQueryClient();
  const { targetUrl } = useWorkspaceTarget();
  const [newUrl, setNewUrl] = useState('');

  const { data } = useQuery<{ sites: MonitoredSite[]; alerts: AlertItem[] }>({
    queryKey: ['monitor'],
    queryFn: () => api.get('/api/monitor'),
    refetchInterval: 4000,
  });

  const addSite = useMutation({
    mutationFn: () => api.post('/api/monitor', { url: newUrl.trim() }),
    onSuccess: () => {
      setNewUrl('');
      queryClient.invalidateQueries({ queryKey: ['monitor'] });
    },
  });

  const removeSite = useMutation({
    mutationFn: (siteId: string) => api.delete(`/api/monitor?siteId=${siteId}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['monitor'] }),
  });

  const runOne = useMutation({
    mutationFn: (siteId: string) => api.post('/api/monitor/run', { siteId }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['monitor'] }),
  });

  const runSweep = useMutation({
    mutationFn: () => api.post('/api/monitor/run', {}),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['monitor'] }),
  });

  const sites = data?.sites ?? [];
  const alerts = data?.alerts ?? [];

  return (
    <div className="space-y-6">
      <Card className="p-5">
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <label className="text-xs font-medium text-fg-muted uppercase tracking-wider mb-1.5 block">
              Add site to monitoring
            </label>
            <Input
              value={newUrl}
              onChange={(e) => setNewUrl(e.target.value)}
              placeholder="example.com"
              disabled={addSite.isPending}
            />
          </div>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={!targetUrl.trim()}
            onClick={() => setNewUrl(targetUrl.trim())}
          >
            Use workspace URL
          </Button>
          <Button disabled={!newUrl.trim() || addSite.isPending} onClick={() => addSite.mutate()}>
            <Plus className="w-4 h-4" />
            Add
          </Button>
          <Button variant="outline" disabled={runSweep.isPending || sites.length === 0} onClick={() => runSweep.mutate()}>
            <Play className="w-4 h-4" />
            Run all now
          </Button>
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>
              <span className="inline-flex items-center gap-2">
                <Activity className="w-3.5 h-3.5 text-accent" />
                Monitored sites ({sites.length})
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {sites.length === 0 ? (
              <p className="text-sm text-fg-muted">No sites monitored yet.</p>
            ) : (
              <div className="space-y-2">
                {sites.map((s) => (
                  <div
                    key={s.id}
                    className="flex items-center gap-3 p-3 rounded-lg border border-border bg-bg-elevated"
                  >
                    {s.lastScore !== null ? (
                      <ScoreGauge score={s.lastScore} size="sm" />
                    ) : (
                      <div className="w-16 h-16 rounded-full border-2 border-dashed border-border flex items-center justify-center">
                        <span className="text-[10px] text-fg-subtle">No data</span>
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-fg truncate">{s.url}</div>
                      <div className="text-[11px] text-fg-subtle mt-0.5">
                        {s.lastRunAt ? `Last run: ${formatDate(s.lastRunAt)}` : 'Never run'}
                        {s.alertCount > 0 && (
                          <Badge variant="warning" className="ml-2">
                            {s.alertCount} alerts
                          </Badge>
                        )}
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => runOne.mutate(s.id)}
                      disabled={runOne.isPending}
                      title="Run audit now"
                    >
                      <Play className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => removeSite.mutate(s.id)}
                      title="Remove from monitoring"
                    >
                      <Trash2 className="w-4 h-4 text-danger" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>
              <span className="inline-flex items-center gap-2">
                <AlertTriangle className="w-3.5 h-3.5 text-warning" />
                Recent alerts ({alerts.length})
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {alerts.length === 0 ? (
              <p className="text-sm text-fg-muted">No alerts yet.</p>
            ) : (
              <div className="space-y-2">
                {alerts.map((a) => (
                  <AlertRow key={a.alert.id} item={a} />
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function AlertRow({ item }: { item: AlertItem }) {
  const { alert, siteUrl, runAt } = item;
  const Icon = alert.severity === 'regression' ? TrendingDown : alert.severity === 'info' ? TrendingUp : Info;
  const tone = alert.severity === 'regression' ? 'text-danger' : alert.severity === 'info' ? 'text-success' : 'text-warning';

  return (
    <div className="p-3 rounded-lg border border-border bg-bg-elevated">
      <div className="flex items-start gap-2">
        <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${tone}`} />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-fg">{alert.title}</div>
          <div className="text-xs text-fg-muted mt-0.5">{alert.detail}</div>
          <div className="text-[11px] text-fg-subtle mt-1.5 flex items-center gap-2">
            <span className="font-mono truncate">{siteUrl}</span>
            <span className="text-fg-subtle/40">·</span>
            <span>{formatDate(runAt)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
