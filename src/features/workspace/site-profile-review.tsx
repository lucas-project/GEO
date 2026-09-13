'use client';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { SiteProfile } from '@modules/extraction';
import { api } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export function SiteProfileReview({ siteId }: { siteId: string }) {
  const client = useQueryClient();
  const [draft, setDraft] = useState<SiteProfile | null>(null);
  const [evidenceUrl, setEvidenceUrl] = useState('');
  const [excerpt, setExcerpt] = useState('');
  const evidence = useQuery<{ evidence: Array<{ id: string; finalUrl: string; excerpt: string }> }>({
    queryKey: ['user-evidence', siteId], queryFn: () => api.get(`/api/off-site-presence/evidence?siteId=${siteId}`),
  });
  const addEvidence = useMutation({ mutationFn: () => api.post('/api/off-site-presence/evidence', { siteId, url: evidenceUrl, excerpt }),
    onSuccess: () => { setExcerpt(''); void client.invalidateQueries({ queryKey: ['user-evidence', siteId] }); } });
  const query = useQuery<{ profile: SiteProfile | null; version: string | null }>({
    queryKey: ['site-profile', siteId], queryFn: () => api.get(`/api/site-profile?siteId=${encodeURIComponent(siteId)}`),
  });
  const profile = draft ?? query.data?.profile;
  const save = useMutation({ mutationFn: () => api.post('/api/site-profile', {
    siteId, expectedVersion: query.data?.version, profile,
  }), onSuccess: async () => { setDraft(null); await client.invalidateQueries({ queryKey: ['site-profile', siteId] }); } });
  if (query.isLoading) return <p>Loading website identity…</p>;
  if (!profile) return <p role="status">Website identity unavailable. Run an audit to collect evidence.</p>;
  return <section className="rounded-lg border border-border p-4 space-y-3" aria-label="Website identity">
    <h2 className="font-medium">Confirm website identity</h2>
    <p className="text-sm text-fg-muted">Review the website owner and offerings. Confirmation records your choices; it does not verify external claims.</p>
    <label className="block text-sm">Organization name<Input value={profile.primaryEntity.name}
      onChange={e => setDraft({ ...profile, primaryEntity: { ...profile.primaryEntity, name: e.target.value } })} /></label>
    <label className="block text-sm">Organization role<select className="block w-full bg-bg border border-border rounded p-2" value={profile.primaryEntity.role}
      onChange={e => setDraft({ ...profile, primaryEntity: { ...profile.primaryEntity, role: e.target.value as SiteProfile['primaryEntity']['role'] } })}>
      {['manufacturer','dealer','marketplace','publisher','product','service','unknown'].map(r => <option key={r}>{r}</option>)}
    </select></label>
    {(['offerings','customerSegments','markets','aliases'] as const).map(field => <label key={field} className="block text-sm">
      {{ offerings: 'Offerings', customerSegments: 'Customers', markets: 'Markets', aliases: 'Other names' }[field]} (comma separated)
      <Input value={profile[field].join(', ')} onChange={e => setDraft({ ...profile, [field]: e.target.value.split(',').map(v => v.trim()) })} />
    </label>)}
    <p className="text-xs">Status: {draft ? 'Unsaved changes' : profile.confirmationState}</p>
    <Button disabled={save.isPending || !profile.primaryEntity.name.trim()} onClick={() => save.mutate()}>Confirm identity</Button>
    {save.isSuccess && <p role="status">Identity saved.</p>}
    {(save.error || query.error) && <p role="alert">{(save.error ?? query.error)?.message}</p>}
    <details><summary>Add supporting evidence</summary>
      <p className="text-sm">User-supplied evidence is retained separately and does not increase the measured score.</p>
      <label className="block">Evidence URL<Input value={evidenceUrl} onChange={e => setEvidenceUrl(e.target.value)} /></label>
      <label className="block">Evidence excerpt<Input value={excerpt} onChange={e => setExcerpt(e.target.value)} /></label>
      <Button disabled={!excerpt.trim() || !evidenceUrl.trim() || addEvidence.isPending} onClick={() => addEvidence.mutate()}>Save evidence</Button>
      {addEvidence.error && <p role="alert">{addEvidence.error.message}</p>}
      {evidence.data?.evidence.map(e => <p key={e.id} className="text-sm">User supplied, unverified: {e.finalUrl} — {e.excerpt}</p>)}
    </details>
  </section>;
}
