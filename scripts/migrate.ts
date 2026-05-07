import * as fs from 'fs';
import * as path from 'path';
import { Client } from 'pg';

const MIGRATIONS_DIR = path.resolve(
  __dirname,
  '..',
  '/src/database/migrations',
);
const DRY_RUN = process.env.DRY_RUN === 'true';

function createClient(): Client {
  return new Client({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
  });
}

function getMigrationFiles(): string[] {
  if (!fs.existsSync(MIGRATIONS_DIR)) return [];

  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();
}

async function getAppliedMigrations(client: Client): Promise<Set<string>> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version     TEXT        PRIMARY KEY,
      applied_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  const { rows } = await client.query<{ version: string }>(
    'SELECT version FROM schema_migrations',
  );
  return new Set(rows.map((r) => r.version));
}

async function applyMigration(client: Client, filename: string): Promise<void> {
  const filepath = path.join(MIGRATIONS_DIR, filename);
  const sql = fs.readFileSync(filepath, 'utf-8');

  await client.query('BEGIN');
  try {
    await client.query(sql);
    await client.query('INSERT INTO schema_migrations (version) VALUES ($1)', [
      filename,
    ]);
    await client.query('COMMIT');
    console.log(`  applied: ${filename}`);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  }
}

async function main() {
  const client = createClient();
  await client.connect();

  try {
    const files = getMigrationFiles();
    const applied = await getAppliedMigrations(client);
    const pending = files.filter((f) => !applied.has(f));

    if (pending.length === 0) {
      console.log('No pending migrations.');
      return;
    }

    console.log(`Pending migrations (${pending.length}):`);
    pending.forEach((f) => console.log(`  - ${f}`));

    if (DRY_RUN) {
      console.log('\nDry run — no changes applied.');
      return;
    }

    console.log('\nApplying...');
    for (const file of pending) {
      await applyMigration(client, file);
    }
    console.log('\nAll migrations applied successfully.');
  } catch (err) {
    console.error('\nMigration failed:', err);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
