import * as fs from 'fs';
import * as path from 'path';

const MIGRATIONS_DIR = path.resolve(
  __dirname,
  '..',
  './src/database/migrations',
);

function getNextSequence(): number {
  if (!fs.existsSync(MIGRATIONS_DIR)) {
    fs.mkdirSync(MIGRATIONS_DIR, { recursive: true });
    return 1;
  }

  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'));
  4;
  if (files.length === 0) return 1;

  const numbers = files
    .map((f) => parseInt(f.split('_')[0], 10))
    .filter((n) => !isNaN(n));
  return Math.max(...numbers) + 1;
}

function main() {
  const name = process.argv[2];

  if (!name) {
    console.error('Usage: pnpm migration:create <migration_name>');
    process.exit(1);
  }

  if (!/^[a-z0-9_]+$/.test(name)) {
    console.error(
      'Migration name must contain only lowercase letters, numbers, and underscores.',
    );
    process.exit(1);
  }

  const filename = `${Date.now()}_${name}.sql`;
  const filepath = path.join(MIGRATIONS_DIR, filename);

  const content = `-- Migration: ${filename}\n-- Created at: ${new Date().toISOString()}\n\n`;

  fs.writeFileSync(filepath, content, 'utf-8');
  console.log(`Created: migrations/${filename}`);
}

main();
