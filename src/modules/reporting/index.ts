/**
 * Report assembly — audit + simulation + competitor gaps + HTML export.
 */

import type { GeoAuditResult } from '../geo-audit/schemas';
import type { SimulationResult } from '../ai-simulation/schemas';

export interface GeoReportBundle {
  audit?: GeoAuditResult | null;
  simulation?: SimulationResult | null;
  competitorGaps?: Array<{ id: string; competitorUrl: string; gap: unknown | null; createdAt: string }>;
  generatedAt: string;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export const reportingService = {
  async assembleBundle(input: {
    audit?: GeoAuditResult | null;
    simulation?: SimulationResult | null;
    competitorGaps?: GeoReportBundle['competitorGaps'];
  }): Promise<GeoReportBundle> {
    return {
      audit: input.audit ?? null,
      simulation: input.simulation ?? null,
      competitorGaps: input.competitorGaps,
      generatedAt: new Date().toISOString(),
    };
  },

  bundleToHtml(bundle: GeoReportBundle): string {
    const parts: string[] = [
      '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>GEO Report</title>',
      '<style>body{font-family:system-ui,sans-serif;max-width:900px;margin:2rem auto;line-height:1.5}',
      'h1,h2{color:#111} pre{background:#f4f4f5;padding:1rem;overflow:auto}</style></head><body>',
      `<h1>GEO AI Operating System — Report</h1><p>Generated: ${escapeHtml(bundle.generatedAt)}</p>`,
    ];

    if (bundle.audit) {
      parts.push(`<h2>Audit: ${escapeHtml(bundle.audit.url)}</h2>`);
      const readiness = bundle.audit.scoringMeta?.readiness;
      parts.push(
        readiness
          ? `<p><strong>Content and technical readiness:</strong> ${readiness.score == null ? 'Insufficient evidence' : readiness.score} (coverage ${Math.round(readiness.coverage * 100)}%)</p>`
          : `<p><strong>Overall score:</strong> ${bundle.audit.overallScore} (historical estimate)</p>`,
      );
      if (bundle.audit.revision != null) parts.push(`<p><strong>Report revision:</strong> ${bundle.audit.revision}</p>`);
      if (bundle.audit.narrative) {
        parts.push(`<h3>Narrative</h3><p>${escapeHtml(bundle.audit.narrative)}</p>`);
      }
    }

    if (bundle.simulation) {
      parts.push(`<h2>Simulation</h2><p>${escapeHtml(bundle.simulation.prompt)}</p>`);
      parts.push(
        `<pre>${escapeHtml(JSON.stringify(bundle.simulation.aggregate, null, 2))}</pre>`,
      );
    }

    if (bundle.competitorGaps?.length) {
      parts.push('<h2>Recent competitor gaps</h2><ul>');
      for (const c of bundle.competitorGaps) {
        parts.push(
          `<li><strong>${escapeHtml(c.competitorUrl)}</strong> (${escapeHtml(c.createdAt)})<pre>${escapeHtml(JSON.stringify(c.gap, null, 2))}</pre></li>`,
        );
      }
      parts.push('</ul>');
    }

    parts.push('</body></html>');
    return parts.join('\n');
  },
};
