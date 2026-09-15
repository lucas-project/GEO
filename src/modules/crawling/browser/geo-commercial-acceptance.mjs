import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { request } from 'playwright';

const base = 'http://localhost:3000';
const payload = {
  url: 'https://www.mdhome.com.au',
  maxPages: 3,
  pageUrls: [
    'https://www.mdhome.com.au',
    'https://www.mdhome.com.au/faqs',
    'https://www.mdhome.com.au/product/athena-series',
  ],
};

const api = await request.newContext({ baseURL: base });

async function runAudit(run) {
  const queued = await api.post('/api/geo-audit', {
    data: payload,
    headers: { 'idempotency-key': `commercial-mdhome-${Date.now()}-${run}` },
  });
  assert.equal(queued.status(), 202);
  const { jobId } = await queued.json();
  let job;
  for (let attempt = 0; attempt < 240; attempt += 1) {
    job = (await (await api.get(`/api/jobs/${jobId}`)).json()).job;
    if (['completed', 'failed', 'cancelled'].includes(job.status)) break;
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  assert.equal(job?.status, 'completed', job?.error ?? 'audit did not complete');
  return (await (await api.get(`/api/geo-audit/${job.result.auditId}`)).json()).audit;
}

function signature(audit) {
  const meta = audit.scoringMeta;
  return {
    status: audit.status,
    overallScore: audit.overallScore,
    dimensions: Object.fromEntries(Object.entries(audit.dimensions).map(([key, value]) => [key, value.score])),
    readiness: meta.readiness?.score,
    readinessCriteria: meta.readiness?.criteria.map(item => [item.criterionId, item.outcome, item.earned, item.possible]),
    contentHashes: meta.evidenceBundle?.evidence.map(item => item.contentHash).filter(Boolean).sort(),
    issues: audit.topIssues.map(item => [item.dimension, item.problem, item.affectedPages]),
    fixes: audit.topFixes.map(item => [item.title, item.dimension, item.artifactType]),
    requestedPages: meta.requestedPages,
    auditedPages: meta.auditedPages,
    coverage: meta.coverage,
  };
}

function evidenceIntegrity(audit) {
  const bundle = audit.scoringMeta.evidenceBundle;
  const ids = new Set(bundle?.evidence.map(item => item.id));
  const criteria = [...(bundle?.criteria ?? []), ...(audit.scoringMeta.readiness?.criteria ?? [])];
  const broken = criteria.filter(item =>
    item.applicability === 'applicable' && item.outcome !== 'unknown' &&
    (!item.evidenceIds.length || item.evidenceIds.some(id => !ids.has(id))),
  );
  return { checkedCriteria: criteria.length, brokenCriteria: broken.map(item => item.criterionId) };
}

const first = await runAudit(1);
const second = await runAudit(2);
const firstSignature = signature(first);
const secondSignature = signature(second);
const exactSignatureMatch = JSON.stringify(firstSignature) === JSON.stringify(secondSignature);
const firstEvidence = evidenceIntegrity(first);
const secondEvidence = evidenceIntegrity(second);

const artifactResponses = [];
for (const audit of [first, second]) {
  const response = await api.post('/api/auto-fix', {
    data: { auditId: audit.id, type: 'faq-schema', targetUrl: payload.pageUrls[1] },
  });
  artifactResponses.push({ status: response.status(), body: await response.json() });
}
const artifactStable = artifactResponses.every(item => item.status === 200) &&
  artifactResponses[0].body.artifact.content === artifactResponses[1].body.artifact.content;

const report = {
  environment: 'production server, live crawl, free-deterministic mode, mock AI',
  scope: payload,
  audits: [first.id, second.id],
  exactSignatureMatch,
  firstSignature,
  secondSignature,
  evidenceIntegrity: [firstEvidence, secondEvidence],
  artifactStable,
  artifactStates: artifactResponses.map(item => ({
    status: item.status,
    contentLength: item.body.artifact?.content?.length ?? 0,
    rationale: item.body.artifact?.rationale,
  })),
  semanticRisks: {
    citationNumericWithoutExperiment: [first, second].map(audit =>
      audit.scoringMeta.simulationRunCount === 0 && typeof audit.scoringMeta.citationProbability === 'number'),
    offSiteNumericWithoutExternalVerification: [first, second].map(audit =>
      !audit.scoringMeta.presenceProbe && typeof audit.dimensions.offSitePresence?.score === 'number'),
  },
};

await writeFile('docs/acceptance-2026-09-14/fixes/commercial-reliability-results.json', `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
await api.dispose();
