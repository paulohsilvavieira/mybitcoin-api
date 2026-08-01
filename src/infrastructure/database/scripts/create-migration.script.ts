import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';

const MIGRATIONS_DIR = path.resolve(__dirname, '', '../migrations');

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
