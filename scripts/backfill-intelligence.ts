/**
 * Backfill intelligence rollups from historical audits.
 * Usage: npx tsx scripts/backfill-intelligence.ts
 */

import { loadEnvConfig } from '@next/env';

loadEnvConfig(process.cwd());

async function main() {
  const { backfillIntelligenceFromAudits, reindexPatterns } = await import(
    '../src/modules/intelligence/ingest'
  );
  const rollup = await backfillIntelligenceFromAudits({ reindexEmbeddings: true });
  console.log('Rollup backfill:', rollup);
  const patterns = await reindexPatterns();
  console.log('Comparative pattern reindex:', patterns);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
