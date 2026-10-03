// Post-build: generate out/sw.js with a per-file revision map of the whole static export.
//
// Each precached URL carries a content revision (sha1 of the file). On update the service
// worker only downloads files whose revision changed and copies the rest from the previous
// caches, so a code-only deploy does not re-download ~13 MB of audio.
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync, writeFileSync, existsSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const OUT = 'out';
if (!existsSync(OUT)) {
  console.error('build-sw: out/ not found — run next build first');
  process.exit(1);
}
const files = [];
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p);
    else files.push(p);
  }
};
walk(OUT);

const SKIP = new Set(['/sw.js', '/_redirects', '/_headers']);
const revisions = {};
for (const f of files.sort()) {
  const rel = '/' + relative(OUT, f).split(sep).join('/');
  if (SKIP.has(rel) || rel.endsWith('.map') || rel.endsWith('.DS_Store')) continue;
  revisions[rel] = createHash('sha1').update(readFileSync(f)).digest('hex').slice(0, 12);
}
// directory-style routes (trailingSlash) — "/" and "/parent/" serve their index.html
for (const [u, rev] of Object.entries({ ...revisions })) {
  if (u.endsWith('/index.html')) revisions[u.slice(0, -'index.html'.length)] = rev;
}

// Entries the game cannot start (or speak) without — the install fails if any is missing,
// so the previous worker and its complete cache stay active.
const critical = Object.keys(revisions).filter(
  (u) =>
    u === '/' ||
    u === '/index.html' ||
    u === '/parent/' ||
    u === '/parent/index.html' ||
    u === '/manifest.webmanifest' ||
    u === '/audio/voice/manifest.json' ||
    u.startsWith('/_next/static/chunks/'),
);

const vh = createHash('sha256');
for (const u of Object.keys(revisions).sort()) vh.update(`${u}:${revisions[u]}\n`);
const version = vh.digest('hex').slice(0, 12);

const tpl = readFileSync('scripts/sw.template.js', 'utf8');
const sw = tpl
  .replace('__VERSION__', version)
  .replace('__REVISIONS__', JSON.stringify(revisions))
  .replace('__CRITICAL__', JSON.stringify(critical));
writeFileSync(join(OUT, 'sw.js'), sw);
const audio = Object.keys(revisions).filter((u) => u.startsWith('/audio/')).length;
console.log(`build-sw: ${Object.keys(revisions).length} files (${audio} audio, ${critical.length} critical), version ${version}`);
