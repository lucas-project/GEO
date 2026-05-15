#!/usr/bin/env node
/**
 * `geo-audit <url>` — convenience entry; delegates to `geo audit <url>`.
 */
import { runAudit } from '../lib/commands/audit.mjs';

const url = process.argv[2];
if (!url) {
  console.error('Usage: geo-audit <url>');
  process.exit(1);
}
runAudit(url).catch((err) => {
  console.error(err.message);
  process.exit(1);
});
