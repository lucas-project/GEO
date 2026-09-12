#!/usr/bin/env npx tsx
/**
 * Standalone off-site presence probe CLI (link.md).
 *
 * Usage:
 *   npm run presence:probe -- https://example.com
 *   npm run presence:probe -- https://example.com --json
 *   npm run presence:probe -- https://example.com --brand="Acme"
 *   npm run presence:probe -- https://example.com --no-playwright
 */

import { toJson, toMarkdown } from '@modules/off-site-presence';
import { runOffSitePresenceProbe } from '@modules/off-site-presence/server';

function parseArgs(argv: string[]): {
  url: string;
  json: boolean;
  brand?: string;
  playwright: boolean;
} {
  const positional = argv.filter((a) => !a.startsWith('--'));
  const url = positional[0];
  if (!url) {
    console.error('Usage: npm run presence:probe -- <url> [--json] [--brand=Name] [--no-playwright]');
    process.exit(1);
  }

  let brand: string | undefined;
  for (const a of argv) {
    if (a.startsWith('--brand=')) brand = a.slice('--brand='.length);
  }

  return {
    url,
    json: argv.includes('--json'),
    brand,
    playwright: !argv.includes('--no-playwright'),
  };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  console.error(`Probing off-site presence for ${args.url}…`);

  const report = await runOffSitePresenceProbe({
    siteUrl: args.url,
    brandOverride: args.brand,
    playwrightEnabled: args.playwright,
  });

  if (args.json) {
    console.log(toJson(report));
  } else {
    console.log(toMarkdown(report));
  }

  process.exit(0);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
