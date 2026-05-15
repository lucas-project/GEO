'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Wand2, Copy, Check, FileCode, FileText, Globe, Edit3, Package, Settings } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { api } from '@/lib/api-client';
import { AuditHelpBlurb, AuditReportIdFieldHelp } from '@/features/workspace/audit-help';
import { useWorkspaceTarget } from '@/features/workspace/workspace-target-context';

const ARTIFACT_TYPES = [
  { id: 'faq-schema', label: 'FAQPage JSON-LD', icon: FileCode, desc: 'Schema.org FAQPage markup ready for <head>' },
  { id: 'llms-txt', label: 'llms.txt', icon: FileText, desc: 'AI crawler manifest (Anthropic spec)' },
  { id: 'ai-summary', label: 'AI Summary Block', icon: Globe, desc: 'Embeddable summary block for the page top' },
  { id: 'answer-first', label: 'Answer-First Rewrite', icon: Edit3, desc: 'Rewrite the lead paragraph in answer-first form' },
  { id: 'product-schema', label: 'Product / Organization', icon: Package, desc: 'JSON-LD for your brand or product' },
  { id: 'metadata', label: 'Metadata Patches', icon: Settings, desc: 'Missing meta description, og:title, canonical' },
] as const;

interface Artifact {
  id: string;
  type: string;
  content: string;
  contentFormat: string;
  rationale: string;
  createdAt: string;
}

export function OptimizeWorkspace() {
  const search = useSearchParams();
  const queryClient = useQueryClient();
  const { lastAuditId } = useWorkspaceTarget();
  const [auditId, setAuditId] = useState(search.get('auditId') ?? '');
  const [selectedType, setSelectedType] = useState<string>(search.get('type') ?? 'faq-schema');
  const [highlightId, setHighlightId] = useState<string | null>(null);

  useEffect(() => {
    const qAudit = search.get('auditId');
    const qType = search.get('type');
    if (qType) setSelectedType(qType);
    if (qAudit) {
      setAuditId(qAudit);
      return;
    }
    if (lastAuditId) {
      setAuditId((prev) => (prev.trim() ? prev : lastAuditId));
    }
  }, [search, lastAuditId]);

  const generate = useMutation({
    mutationFn: () =>
      api.post<{ artifact: Artifact }>('/api/auto-fix', { auditId: auditId.trim(), type: selectedType }),
    onSuccess: (data) => {
      setHighlightId(data.artifact.id);
      void queryClient.invalidateQueries({ queryKey: ['artifacts', auditId.trim()] });
    },
  });

  useEffect(() => {
    generate.reset();
    setHighlightId(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset mutation when inputs change
  }, [selectedType, auditId]);

  const { data, isFetching } = useQuery<{ artifacts: Artifact[] }>({
    queryKey: ['artifacts', auditId.trim()],
    enabled: Boolean(auditId.trim()),
    queryFn: () => api.get(`/api/auto-fix?auditId=${encodeURIComponent(auditId.trim())}`),
  });

  const artifacts = useMemo(() => {
    const list = [...(data?.artifacts ?? [])];
    const fresh = generate.data?.artifact;
    if (fresh && !list.some((a) => a.id === fresh.id)) {
      list.unshift(fresh);
    }
    return list.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  }, [data?.artifacts, generate.data?.artifact]);

  const typeLabel =
    ARTIFACT_TYPES.find((t) => t.id === selectedType)?.label ?? selectedType;

  return (
    <div className="space-y-6">
      <Card className="p-5 space-y-4">
        <p className="text-[11px] text-fg-subtle leading-relaxed">
          This does <strong className="font-medium text-fg-muted">not</strong> edit your website automatically.
          It generates files and HTML you can copy into your CMS or theme. Optional WordPress draft apply exists
          only when CMS credentials are configured.
        </p>
        <AuditHelpBlurb />
        <div>
          <label className="text-xs font-medium text-fg-muted uppercase tracking-wider mb-1.5 block">
            Which audit report?
          </label>
          <Input
            value={auditId}
            onChange={(e) => setAuditId(e.target.value)}
            placeholder="Filled automatically after GEO Audit"
            className="font-mono text-xs"
          />
          <AuditReportIdFieldHelp />
        </div>

        <div>
          <label className="text-xs font-medium text-fg-muted uppercase tracking-wider mb-2 block">
            Artifact type
          </label>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
            {ARTIFACT_TYPES.map((t) => {
              const Icon = t.icon;
              const active = selectedType === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setSelectedType(t.id)}
                  className={`text-left p-3 rounded-lg border transition-all ${
                    active
                      ? 'border-accent/40 bg-accent/10'
                      : 'border-border bg-bg-elevated hover:bg-bg-muted'
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <Icon className={`w-4 h-4 mt-0.5 ${active ? 'text-accent' : 'text-fg-muted'}`} />
                    <div className="min-w-0">
                      <div className={`text-sm font-medium ${active ? 'text-accent' : 'text-fg'}`}>
                        {t.label}
                      </div>
                      <div className="text-[11px] text-fg-muted mt-0.5 leading-snug">{t.desc}</div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 pt-2">
          {generate.isSuccess && !generate.isPending && (
            <span className="text-[11px] text-fg-subtle mr-auto">
              Last generated: <span className="text-fg-muted">{typeLabel}</span>
            </span>
          )}
          <Button
            disabled={!auditId.trim() || generate.isPending}
            onClick={() => generate.mutate()}
          >
            {generate.isPending ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Generating…
              </>
            ) : (
              <>
                <Wand2 className="w-4 h-4" />
                Generate {typeLabel}
              </>
            )}
          </Button>
        </div>

        {generate.error && (
          <p className="text-xs text-danger" role="alert">
            {(generate.error as Error).message}
          </p>
        )}
      </Card>

      {(artifacts.length > 0 || isFetching) && (
        <Card>
          <CardHeader>
            <CardTitle>
              Generated artifacts
              {artifacts.length > 0 ? ` (${artifacts.length})` : ''}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {isFetching && artifacts.length === 0 ? (
              <p className="text-xs text-fg-subtle">Loading…</p>
            ) : (
              artifacts.map((a) => (
                <ArtifactCard
                  key={a.id}
                  artifact={a}
                  highlighted={a.id === highlightId}
                />
              ))
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function ArtifactCard({
  artifact,
  highlighted,
}: {
  artifact: Artifact;
  highlighted?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(artifact.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const typeLabel =
    ARTIFACT_TYPES.find((t) => t.id === artifact.type)?.label ?? artifact.type;

  return (
    <div
      className={`rounded-lg border bg-bg-elevated overflow-hidden ${
        highlighted ? 'border-accent/50 ring-1 ring-accent/20' : 'border-border'
      }`}
    >
      <div className="flex items-center justify-between gap-2 px-4 py-2.5 border-b border-border-subtle">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="accent">{typeLabel}</Badge>
          {highlighted && (
            <Badge variant="outline" className="text-[10px]">
              Just generated
            </Badge>
          )}
          <span className="text-[11px] text-fg-subtle">
            {new Date(artifact.createdAt).toLocaleString()}
          </span>
        </div>
        <Button size="sm" variant="ghost" onClick={copy}>
          {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
          {copied ? 'Copied' : 'Copy'}
        </Button>
      </div>
      {artifact.rationale && (
        <div className="px-4 py-2 text-[11px] text-fg-muted bg-bg-subtle/40 border-b border-border-subtle">
          {artifact.rationale}
        </div>
      )}
      <pre className="p-4 text-[12px] leading-relaxed font-mono text-fg whitespace-pre-wrap break-all max-h-96 overflow-y-auto">
        {artifact.content}
      </pre>
    </div>
  );
}
