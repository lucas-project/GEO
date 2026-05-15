/**
 * Side-panel logic — POSTs the current tab's URL to /api/geo-audit
 * and renders the result.
 */

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

const $ = (id) => document.getElementById(id);

async function getApiUrl() {
  const { geoApiUrl } = await chrome.storage.local.get('geoApiUrl');
  return geoApiUrl || 'http://localhost:3000';
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function init() {
  const tab = await getActiveTab();
  $('page-url').textContent = tab?.url ?? 'unknown';
}

$('run-audit').addEventListener('click', async () => {
  const tab = await getActiveTab();
  if (!tab?.url) return;
  const apiUrl = await getApiUrl();
  const status = $('status');
  status.classList.remove('hidden', 'error');
  status.textContent = 'Queueing audit…';
  $('run-audit').disabled = true;
  $('result').classList.add('hidden');

  try {
    const res = await fetch(`${apiUrl}/api/geo-audit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: tab.url }),
    });
    if (!res.ok) throw new Error(`API error: ${res.status}`);
    const { jobId } = await res.json();
    const job = await pollJob(apiUrl, jobId, (j) => {
      status.textContent = `${j.status} · ${j.progress}%`;
    });
    if (job.status !== 'completed') {
      throw new Error(job.error || `Audit ${job.status}`);
    }
    const auditId = job.result?.auditId;
    const auditResp = await fetch(`${apiUrl}/api/geo-audit/${auditId}`);
    const { audit } = await auditResp.json();
    status.classList.add('hidden');
    renderResult(audit, apiUrl);
  } catch (err) {
    status.classList.add('error');
    status.textContent = `Error: ${err.message}`;
  } finally {
    $('run-audit').disabled = false;
  }
});

$('open-options').addEventListener('click', (e) => {
  e.preventDefault();
  chrome.runtime.openOptionsPage();
});

async function pollJob(apiUrl, jobId, onProgress) {
  const t0 = Date.now();
  while (Date.now() - t0 < 5 * 60 * 1000) {
    const res = await fetch(`${apiUrl}/api/jobs/${jobId}`);
    if (!res.ok) throw new Error(`Job poll failed: ${res.status}`);
    const { job } = await res.json();
    onProgress?.(job);
    if (job.status === 'completed' || job.status === 'failed' || job.status === 'cancelled') {
      return job;
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  throw new Error('Timed out');
}

function colorFor(score) {
  if (score >= 80) return '#22c55e';
  if (score >= 60) return '#f59e0b';
  return '#ef4444';
}

function renderResult(audit, apiUrl) {
  const result = $('result');
  result.classList.remove('hidden');

  $('score-text').textContent = audit.overallScore;
  $('score-text').style.color = colorFor(audit.overallScore);
  const arc = $('gauge-arc');
  const circ = 276;
  arc.style.strokeDashoffset = circ - (audit.overallScore / 100) * circ;
  arc.style.stroke = colorFor(audit.overallScore);
  $('score-label').textContent = audit.overallScore >= 80 ? 'Strong' : audit.overallScore >= 60 ? 'Adequate' : 'Needs work';

  const dimsEl = $('dimensions');
  dimsEl.innerHTML = '';
  for (const [key, label] of Object.entries(DIMENSION_LABELS)) {
    const d = audit.dimensions[key] ?? { score: 0 };
    const row = document.createElement('div');
    row.className = 'dim';
    row.innerHTML = `
      <span class="dim-label">${label}</span>
      <span class="dim-bar"><span class="dim-bar-fill" style="width:${d.score}%;background:${colorFor(d.score)}"></span></span>
      <span class="dim-score" style="color:${colorFor(d.score)}">${d.score}</span>
    `;
    dimsEl.appendChild(row);
  }

  const issuesEl = $('issues');
  issuesEl.innerHTML = '';
  for (const issue of audit.topIssues.slice(0, 5)) {
    const el = document.createElement('div');
    el.className = 'issue';
    el.innerHTML = `
      <div class="issue-title">${escapeHtml(issue.title)} <span class="badge badge-${issue.severity}">${issue.severity}</span></div>
      <div class="issue-desc">${escapeHtml(issue.description ?? '')}</div>
    `;
    issuesEl.appendChild(el);
  }
  if (audit.topIssues.length === 0) issuesEl.innerHTML = '<div class="issue-desc">None — nice work.</div>';

  const fixesEl = $('fixes');
  fixesEl.innerHTML = '';
  for (const fix of audit.topFixes.slice(0, 4)) {
    const el = document.createElement('div');
    el.className = 'fix';
    el.innerHTML = `
      <div class="fix-title">${escapeHtml(fix.title)} <span class="badge badge-${fix.effort === 'low' ? 'low' : 'medium'}">${fix.effort} effort</span></div>
      <div class="fix-desc">${escapeHtml(fix.description)}</div>
    `;
    fixesEl.appendChild(el);
  }

  $('open-full-report').href = `${apiUrl}/audit/${audit.id}`;
}

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

init();
