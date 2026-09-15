'use client';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { SiteProfile } from '@modules/extraction';
import { api } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const roleLabels: Record<SiteProfile['primaryEntity']['role'], string> = {
  manufacturer: 'Manufacturer / brand', dealer: 'Dealer / retailer', marketplace: 'Marketplace / platform', publisher: 'Publisher / media', product: 'Product / software company', service: 'Service provider', unknown: 'Not sure yet',
};
const fieldLabels = {
  offerings: ['What products or services does it provide?', 'For example: residential air conditioning, hot water systems, installation'],
  customerSegments: ['Who does it primarily serve?', 'For example: homeowners, commercial property owners, installation contractors'],
  markets: ['Which regions or markets does it serve?', 'For example: Australia, New South Wales, Asia-Pacific'],
  aliases: ['What other names are used for it?', 'For example: brand abbreviations, former names, product line names'],
} as const;

export function SiteProfileReview({ siteId }: { siteId: string }) {
  const client = useQueryClient();
  const [draft, setDraft] = useState<SiteProfile | null>(null);
  const [evidenceUrl, setEvidenceUrl] = useState('');
  const [excerpt, setExcerpt] = useState('');
  const evidence = useQuery<{ evidence: Array<{ id: string; finalUrl: string; excerpt: string }> }>({ queryKey: ['user-evidence', siteId], queryFn: () => api.get(`/api/off-site-presence/evidence?siteId=${siteId}`) });
  const addEvidence = useMutation({ mutationFn: () => api.post('/api/off-site-presence/evidence', { siteId, url: evidenceUrl, excerpt }), onSuccess: () => { setExcerpt(''); void client.invalidateQueries({ queryKey: ['user-evidence', siteId] }); } });
  const query = useQuery<{ profile: SiteProfile | null; version: string | null }>({ queryKey: ['site-profile', siteId], queryFn: () => api.get(`/api/site-profile?siteId=${encodeURIComponent(siteId)}`) });
  const profile = draft ?? query.data?.profile;
  const save = useMutation({ mutationFn: () => api.post('/api/site-profile', { siteId, expectedVersion: query.data?.version, profile }), onSuccess: async () => { setDraft(null); await client.invalidateQueries({ queryKey: ['site-profile', siteId] }); } });
  if (query.isLoading) return <p>Loading target website information…</p>;
  if (!profile) return <p role="status">Target website information is unavailable. Run an audit first.</p>;
  return <section className="rounded-lg border border-border p-4 space-y-3" aria-label="Target website information">
    <div><h2 className="font-medium">Review this target website (optional)</h2><p className="mt-1 text-sm text-fg-muted">GEO automatically identified the organisation or brand represented by this target website. Check the name if you want more accurate brand-related recommendations, simulations, or off-site analysis.</p><p className="mt-1 text-xs text-fg-subtle">This is not ownership verification. Leaving it unchanged will not affect the basic crawl or audit score.</p></div>
    <div className="rounded-md bg-bg-subtle px-3 py-2 text-xs text-fg-muted">Detected target: <span className="font-medium text-fg">{profile.primaryEntity.name || 'No name identified'}</span><span className="ml-2">· {profile.confirmationState === 'needs_review' ? 'Needs review' : 'Ready to use'}</span></div>
    <details open={profile.confirmationState === 'needs_review' || Boolean(draft)}><summary className="cursor-pointer text-sm font-medium text-accent">Review or edit target information</summary><div className="mt-3 space-y-3">
      <label className="block text-sm">What should we call this target?<span className="ml-1 text-fg-subtle">(optional)</span><Input aria-label="Target organisation or brand name" placeholder="For example: Daikin Australia" value={profile.primaryEntity.name} onChange={e => setDraft({ ...profile, primaryEntity: { ...profile.primaryEntity, name: e.target.value } })} /><span className="mt-1 block text-xs text-fg-subtle">Use the public organisation or brand name, not the URL. If this is wrong, brand-specific results may be attributed to the wrong organisation.</span></label>
      <label className="block text-sm">What kind of organisation is it?<span className="ml-1 text-fg-subtle">(optional)</span><select aria-label="Target organisation type" className="block w-full bg-bg border border-border rounded p-2 mt-1" value={profile.primaryEntity.role} onChange={e => setDraft({ ...profile, primaryEntity: { ...profile.primaryEntity, role: e.target.value as SiteProfile['primaryEntity']['role'] } })}>{Object.entries(roleLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><span className="mt-1 block text-xs text-fg-subtle">This only affects brand and market context; it does not change the technical audit score.</span></label>
      <details><summary className="cursor-pointer text-sm text-accent">Add more context (optional)</summary><div className="mt-3 space-y-3"><p className="text-xs text-fg-subtle">Most users can leave these fields empty. They help tailor recommendations but take more time to complete.</p>{(['offerings', 'customerSegments', 'markets', 'aliases'] as const).map(field => <label key={field} className="block text-sm">{fieldLabels[field][0]}<Input aria-label={field} placeholder={fieldLabels[field][1]} value={profile[field].join(', ')} onChange={e => setDraft({ ...profile, [field]: e.target.value.split(',').map(v => v.trim()).filter(Boolean) })} /><span className="mt-1 block text-xs text-fg-subtle">Separate multiple answers with commas, or leave blank.</span></label>)}</div></details>
      <p className="text-xs text-fg-subtle">Status: {draft ? 'Edited but not saved' : profile.confirmationState === 'needs_review' ? 'Needs review' : 'Automatically identified'}</p><Button disabled={save.isPending || !profile.primaryEntity.name.trim()} onClick={() => save.mutate()}>Save target information</Button>
    </div></details>
    {save.isSuccess && <p role="status">Target information saved.</p>}{(save.error || query.error) && <p role="alert">{(save.error ?? query.error)?.message}</p>}
    <details><summary>Add supporting evidence (optional)</summary><p className="text-sm">Links and excerpts you provide are stored separately as unverified evidence and do not directly increase the score.</p><label className="block">Evidence page URL<Input value={evidenceUrl} onChange={e => setEvidenceUrl(e.target.value)} /></label><label className="block">Exact excerpt that supports this information<Input value={excerpt} onChange={e => setExcerpt(e.target.value)} /></label><Button disabled={!excerpt.trim() || !evidenceUrl.trim() || addEvidence.isPending} onClick={() => addEvidence.mutate()}>Save supporting evidence</Button>{addEvidence.error && <p role="alert">{addEvidence.error.message}</p>}{evidence.data?.evidence.map(e => <p key={e.id} className="text-sm">User supplied, unverified: {e.finalUrl} — {e.excerpt}</p>)}</details>
  </section>;
}
