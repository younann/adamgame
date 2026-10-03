// Entry point: `node scripts/voice/run.mjs [extract|generate|all] [--prune] [--force]`
// Uses jiti (already in node_modules) to run the TypeScript extractor against the real game sources.
import { createJiti } from 'jiti';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const cmd = process.argv[2] ?? 'all';
const flags = process.argv.slice(3);

if (cmd === 'extract' || cmd === 'all') {
  const jiti = createJiti(import.meta.url, { alias: { '@': join(root, 'src') } });
  await jiti.import(join(here, 'extract-lines.ts'));
}
if (cmd === 'generate' || cmd === 'all') {
  const r = spawnSync(process.execPath, [join(here, 'generate.mjs'), ...flags], { stdio: 'inherit', cwd: root });
  if (r.status !== 0) process.exit(r.status ?? 1);
}
