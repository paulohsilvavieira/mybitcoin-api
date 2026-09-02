import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

const DOMAIN_DIR = join(__dirname);

const FORBIDDEN_IMPORT =
  /from\s+['"](?:@\/modules\/kyc\/(?:application|infrastructure|presentation)|\.\.?\/(?:.*\/)?(?:application|infrastructure|presentation))/;

function collectTsFiles(dir: string): string[] {
  const entries = readdirSync(dir, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return collectTsFiles(full);
    if (entry.name.endsWith('.ts') && !entry.name.endsWith('.spec.ts')) {
      return [full];
    }
    return [];
  });
}

describe('kyc/domain — Regra de Dependência', () => {
  const files = collectTsFiles(DOMAIN_DIR);

  it('encontra arquivos de domínio para inspecionar', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files)(
    '%s não importa de application/infrastructure/presentation',
    (file) => {
      const content = readFileSync(file, 'utf8');
      const offending = content
        .split('\n')
        .filter((line) => FORBIDDEN_IMPORT.test(line));

      expect(offending).toEqual([]);
    },
  );
});
