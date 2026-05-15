/**
 * Comparison-table extractor — important GEO signal because LLMs love
 * structured comparisons when answering "X vs Y" type queries.
 */

import type { CheerioAPI } from 'cheerio';
import type { ComparisonTable } from '../schemas';

export function extractTables($: CheerioAPI): ComparisonTable[] {
  const out: ComparisonTable[] = [];
  $('table').each((_, table) => {
    const $t = $(table);
    const caption = $t.find('caption').first().text().trim() || null;

    const headerRow = $t.find('thead tr').first().length
      ? $t.find('thead tr').first()
      : $t.find('tr').first();
    const headers: string[] = [];
    headerRow.find('th, td').each((_, c) => {
      headers.push($(c).text().replace(/\s+/g, ' ').trim());
    });

    const rows: string[][] = [];
    const dataRows = $t.find('thead').length ? $t.find('tbody tr') : $t.find('tr').slice(1);
    dataRows.each((_, tr) => {
      const cells: string[] = [];
      $(tr)
        .find('td, th')
        .each((_, c) => {
          cells.push($(c).text().replace(/\s+/g, ' ').trim());
        });
      if (cells.length) rows.push(cells);
    });

    if (headers.length >= 2 && rows.length >= 1) {
      out.push({ headers, rows: rows.slice(0, 50), caption });
    }
  });
  return out;
}
