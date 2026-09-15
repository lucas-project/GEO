/** Verify that a stopped-instance SQLite backup is internally readable. */
import { DatabaseSync } from 'node:sqlite';
import { stat } from 'node:fs/promises';
import { resolve } from 'node:path';

const input = process.argv[2];
if (!input) {
  throw new Error('Usage: npm run db:verify-backup -- <backup.db>');
}

const backupPath = resolve(process.cwd(), input);
await stat(backupPath).catch(() => {
  throw new Error(`SQLite backup was not found at ${backupPath}`);
});

const database = new DatabaseSync(backupPath, { readOnly: true });
try {
  const quickCheck = database.prepare('PRAGMA quick_check').all();
  if (quickCheck.length === 0 || quickCheck.some((row) => Object.values(row)[0] !== 'ok')) {
    throw new Error(`SQLite integrity check failed: ${JSON.stringify(quickCheck)}`);
  }

  const tables = database.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all();
  const names = new Set(tables.map((table) => table.name));
  // db push installations legitimately have no Prisma migration history.
  for (const required of ['GeoAudit', 'Job']) {
    if (!names.has(required)) throw new Error(`Backup is missing required table: ${required}`);
  }

  console.log(`SQLite backup verified: ${backupPath}`);
  console.log(`Integrity: ok; tables: ${tables.length}`);
} finally {
  database.close();
}
