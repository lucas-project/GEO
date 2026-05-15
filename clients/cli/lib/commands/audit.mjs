import { api, pollJob } from '../api.mjs';
import { spinner, style, bar, divider, heading, scoreColor } from '../ui.mjs';

const DIMENSION_LABELS = {
  aiReadability: 'AI Readability',
  citationFriendliness: 'Citation Friendliness',
  semanticClarity: 'Semantic Clarity',
  entityClarity: 'Entity Clarity',
  answerExtraction: 'Answer Extraction',
  chunkOptimization: 'Chunk Optimization',
  summarizationQuality: 'Summarization Quality',
  trustSignals: 'Trust Signals',
  structuredContent: 'Structured Content',
  crawlerFriendliness: 'Crawler Friendliness',
};

export async function runAudit(url) {
  if (!url) throw new Error('URL is required. Usage: geo audit <url>');

  const spin = spinner(`Queueing audit for ${url}…`);
  const { jobId } = await api.post('/api/geo-audit', { url });
  spin.update(`Job ${jobId.slice(0, 8)} queued — running…`);

  const job = await pollJob(jobId, {
    onProgress: (j) => spin.update(`${j.status} · ${j.progress}%`),
  });

  if (job.status !== 'completed') {
    spin.stop(style.red(`✗ Audit ${job.status}: ${job.error ?? 'unknown error'}`));
    process.exit(1);
  }

  const auditId = job.result?.auditId;
  spin.stop(style.green(`✓ Audit complete (${auditId})`));

  const { audit } = await api.get(`/api/geo-audit/${auditId}`);
  printAudit(audit);
}

function printAudit(audit) {
  console.log(heading('GEO Audit Report'));
  console.log(style.gray('URL:        ') + audit.url);
  console.log(style.gray('Audit ID:   ') + audit.id);
  console.log(style.gray('Created:    ') + new Date(audit.createdAt).toLocaleString());

  const sc = scoreColor(audit.overallScore);
  console.log();
  console.log(style.bold('Overall:    ') + sc(`${audit.overallScore}/100`) + '  ' + bar(audit.overallScore, 32));
  console.log();

  if (audit.narrative) {
    console.log(heading('Executive Summary'));
    console.log(wrap(audit.narrative, 78));
  }

  console.log(heading('10-Dimension Breakdown'));
  for (const [key, label] of Object.entries(DIMENSION_LABELS)) {
    const d = audit.dimensions[key] ?? { score: 0, reasons: [] };
    const color = scoreColor(d.score);
    const tag = String(d.score).padStart(3);
    console.log(`  ${color(tag)}  ${label.padEnd(24)} ${bar(d.score, 20)}`);
    if (d.reasons.length) {
      console.log('       ' + style.gray('· ' + d.reasons[0]));
    }
  }

  if (audit.topIssues.length > 0) {
    console.log(heading('Top Issues'));
    for (const issue of audit.topIssues) {
      const tone = issue.severity === 'critical' ? style.red : issue.severity === 'high' ? style.yellow : style.gray;
      console.log(`  ${tone('●')} ${style.bold(issue.title)}  ${style.gray('[' + issue.severity + ']')}`);
      if (issue.description) console.log('    ' + style.gray(issue.description));
    }
  }

  if (audit.topFixes.length > 0) {
    console.log(heading('Recommended Fixes'));
    for (const fix of audit.topFixes) {
      console.log(`  ${style.cyan('→')} ${style.bold(fix.title)}  ${style.gray('[' + fix.effort + ']')}`);
      console.log('    ' + style.gray(fix.description));
    }
    console.log();
    console.log(style.gray('Generate one with: ') + style.bold(`geo fix ${audit.id} <type>`));
  }

  console.log();
  console.log(divider());
}

function wrap(text, width) {
  const words = text.split(/\s+/);
  let line = '';
  const out = [];
  for (const w of words) {
    if ((line + ' ' + w).trim().length > width) {
      out.push(line.trim());
      line = w;
    } else {
      line += ' ' + w;
    }
  }
  if (line.trim()) out.push(line.trim());
  return out.map((l) => '  ' + l).join('\n');
}
