/** Create a recoverable SQLite backup for a single-instance deployment. */
import { copyFile, mkdir, stat } from 'node:fs/promises';
import { basename, extname, join, resolve } from 'node:path';

function sqlitePath(databaseUrl: string): string {
  if (!databaseUrl.startsWith('file:')) {
    throw new Error('db:backup supports SQLite DATABASE_URL values only. Use your managed PostgreSQL backup process instead.');
  }
  const filename = databaseUrl.slice('file:'.length).split('?')[0];
  if (!filename) throw new Error('DATABASE_URL does not contain a SQLite file path.');
  return resolve(process.cwd(), filename);
}

const source = sqlitePath(process.env.DATABASE_URL ?? 'file:./prisma/dev.db');
const backupDir = resolve(process.cwd(), process.env.GEO_DB_BACKUP_DIR ?? './data/backups');
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const extension = extname(source) || '.db';
const destination = join(backupDir, `${basename(source, extension)}-${stamp}${extension}`);

await stat(source).catch(() => { throw new Error(`SQLite database was not found at ${source}`); });
await mkdir(backupDir, { recursive: true });
await copyFile(source, destination);
for (const suffix of ['-wal', '-shm']) {
  await copyFile(`${source}${suffix}`, `${destination}${suffix}`).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== 'ENOENT') throw error;
  });
}
console.log(`SQLite backup created: ${destination}`);
console.log('Restore with the web app and worker stopped; copy the database and any matching -wal/-shm sidecars together.');
