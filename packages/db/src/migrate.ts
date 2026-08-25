import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from 'pg';

const root = join(dirname(fileURLToPath(import.meta.url)), '../../../');
const migrationsDir = join(root, 'apps/api/prisma/migrations');
const client = new Client({ connectionString: process.env.DATABASE_URL ?? 'postgresql://ai_office:ai_office@localhost:55432/ai_office' });

await client.connect();
await client.query('CREATE TABLE IF NOT EXISTS "_aiOfficeMigrations" ("name" TEXT PRIMARY KEY, "appliedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW())');
const applied = new Set((await client.query<{ name: string }>('SELECT "name" FROM "_aiOfficeMigrations"')).rows.map((row) => row.name));
for (const name of (await readdir(migrationsDir)).sort()) {
  if (applied.has(name)) continue;
  const sql = await readFile(join(migrationsDir, name, 'migration.sql'), 'utf8');
  const baseline = name.endsWith('identity_foundation') && (await client.query("SELECT to_regclass('public.user') AS table")).rows[0]?.table;
  const domain = name.endsWith('office_domain') && (await client.query('SELECT to_regclass(\'public."Project"\') AS table')).rows[0]?.table;
  if (!baseline && !domain) await client.query(sql);
  await client.query('INSERT INTO "_aiOfficeMigrations" ("name") VALUES ($1)', [name]);
  process.stdout.write(`applied ${name}${baseline || domain ? ' (existing schema)' : ''}\n`);
}
await client.end();
