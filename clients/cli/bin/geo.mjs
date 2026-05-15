#!/usr/bin/env node
/**
 * `geo` — multi-command CLI for the GEO AI Operating System.
 *
 * Available commands:
 *   geo audit <url>                     Run a GEO audit
 *   geo simulate "<prompt>"             Simulate AI search across platforms
 *   geo compare <target> <competitor>…  Compare against up to 5 competitors
 *   geo fix <auditId> <type>            Generate a fix artifact
 *   geo agent "<goal>"                  Dispatch an autonomous plan
 *
 * Env:
 *   GEO_API_URL  Override the API base URL (default http://localhost:3000)
 */

import { runAudit } from '../lib/commands/audit.mjs';
import { runSimulate } from '../lib/commands/simulate.mjs';
import { runCompare } from '../lib/commands/compare.mjs';
import { runFix } from '../lib/commands/fix.mjs';
import { runAgent } from '../lib/commands/agent.mjs';
import { style } from '../lib/ui.mjs';

const [, , command, ...rest] = process.argv;

const COMMANDS = {
  audit: { help: 'geo audit <url>', fn: (args) => runAudit(args[0]) },
  simulate: { help: 'geo simulate "<prompt>" [--brand=<name>]', fn: (args) => runSimulate(args) },
  compare: { help: 'geo compare <target> <competitor1> [competitor2 ...]', fn: (args) => runCompare(args) },
  fix: { help: 'geo fix <auditId> <type>', fn: (args) => runFix(args[0], args[1]) },
  agent: { help: 'geo agent "<goal>"', fn: (args) => runAgent(args.join(' ')) },
};

function help() {
  console.log(style.bold('GEO AI Operating System CLI'));
  console.log();
  console.log('Commands:');
  for (const [name, cmd] of Object.entries(COMMANDS)) {
    console.log('  ' + style.cyan(name.padEnd(10)) + cmd.help);
  }
  console.log();
  console.log(style.gray('Set GEO_API_URL to point at a non-local backend.'));
}

if (!command || command === '--help' || command === '-h') {
  help();
  process.exit(0);
}

const cmd = COMMANDS[command];
if (!cmd) {
  console.error('Unknown command: ' + command);
  help();
  process.exit(1);
}

cmd.fn(rest).catch((err) => {
  console.error(style.red('error: ') + err.message);
  process.exit(1);
});
