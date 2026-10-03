// Incremental neural-TTS generation: scripts/voice/lines.json → public/audio/voice/*.mp3 + manifest.json
// Usage: node scripts/voice/generate.mjs [--prune] [--force]
// Requires edge-tts (EDGE_TTS env var, or `edge-tts` on PATH) and ffmpeg/ffprobe.
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { tmpdir } from 'node:os';

const run = promisify(execFile);
const ROOT = process.cwd();
const OUT = join(ROOT, 'public/audio/voice');
const LINES = join(ROOT, 'scripts/voice/lines.json');
const VOICES = JSON.parse(readFileSync(join(ROOT, 'scripts/voice/voices.json'), 'utf8'));
const EDGE = process.env.EDGE_TTS || 'edge-tts';
const prune = process.argv.includes('--prune');
const force = process.argv.includes('--force');
const CONCURRENCY = Number(process.env.VOICE_CONCURRENCY || 6);

mkdirSync(OUT, { recursive: true });
const lines = JSON.parse(readFileSync(LINES, 'utf8'));
const manifestPath = join(OUT, 'manifest.json');
const old = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : { clips: {} };

const voiceSpeaker = (speaker, lang) => (lang === 'en' ? 'en' : speaker);
const cfgFor = (vs, slow) => {
  const c = VOICES[vs] ?? VOICES.sparky;
  return slow && c.slowRate ? { ...c, rate: c.slowRate } : c;
};
// the voice config is part of the key, so changing a voice in voices.json regenerates its clips
const keyFor = (vs, lang, text, cfg) =>
  createHash('sha1').update(`${vs}|${lang}|${text}|${cfg.voice}|${cfg.rate}|${cfg.pitch}`).digest('hex').slice(0, 12);

const manifest = { version: 1, voices: VOICES, clips: {}, index: {}, byText: {} };
const jobs = [];
for (const l of lines) {
  const vs = voiceSpeaker(l.speaker, l.lang);
  const cfg = cfgFor(vs, l.slow);
  const key = keyFor(vs, l.lang, l.text, cfg);
  manifest.index[`${vs}|${l.lang}|${l.text}`] = key;
  // byText prefers sparky / en for "any speaker" fallback
  const tk = `${l.lang}|${l.text}`;
  if (!manifest.byText[tk] || vs === 'sparky' || vs === 'en') manifest.byText[tk] = key;
  if (manifest.clips[key]) continue;
  manifest.clips[key] = { f: `${key}.mp3`, d: old.clips?.[key]?.d ?? 0 };
  const file = join(OUT, `${key}.mp3`);
  if (force || !existsSync(file) || !old.clips?.[key]?.d) jobs.push({ key, file, text: l.text, cfg });
}

async function synth(job) {
  const tmp = join(tmpdir(), `voice-${job.key}-${process.pid}.mp3`);
  const args = ['--voice', job.cfg.voice, `--rate=${job.cfg.rate}`, `--pitch=${job.cfg.pitch}`, '--text', job.text, '--write-media', tmp];
  for (let attempt = 1; ; attempt++) {
    try {
      await run(EDGE, args, { timeout: 60_000 });
      // trim silence at both ends, mono, 24 kHz, compact bitrate
      await run('ffmpeg', [
        '-y', '-loglevel', 'error', '-i', tmp,
        '-af', 'silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.04,areverse,silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.08,areverse,loudnorm=I=-16:TP=-1.5:LRA=11',
        '-ac', '1', '-ar', '24000', '-b:a', '40k', job.file,
      ]);
      const { stdout } = await run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', job.file]);
      manifest.clips[job.key].d = Math.round(parseFloat(stdout) * 100) / 100 || 1;
      rmSync(tmp, { force: true });
      return;
    } catch (err) {
      if (attempt >= 4) {
        console.error(`voice: FAILED "${job.text}" (${job.cfg.voice}): ${String(err).slice(0, 160)}`);
        delete manifest.clips[job.key];
        return;
      }
      await new Promise((r) => setTimeout(r, 800 * attempt * attempt));
    }
  }
}

let done = 0;
const queue = [...jobs];
await Promise.all(
  Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
    while (queue.length) {
      const job = queue.shift();
      await synth(job);
      if (++done % 50 === 0 || done === jobs.length) console.log(`voice: ${done}/${jobs.length}`);
    }
  }),
);

// drop index entries whose clip failed
for (const [k, v] of Object.entries(manifest.index)) if (!manifest.clips[v]) delete manifest.index[k];
for (const [k, v] of Object.entries(manifest.byText)) if (!manifest.clips[v]) delete manifest.byText[k];

if (prune) {
  let removed = 0;
  for (const f of readdirSync(OUT)) {
    if (!f.endsWith('.mp3')) continue;
    if (!manifest.clips[f.slice(0, -4)]) {
      rmSync(join(OUT, f));
      removed++;
    }
  }
  console.log(`voice: pruned ${removed} orphaned clips`);
}

writeFileSync(manifestPath, JSON.stringify(manifest));
const bytes = readdirSync(OUT).reduce((n, f) => n + statSync(join(OUT, f)).size, 0);
console.log(`voice: ${Object.keys(manifest.clips).length} clips, ${jobs.length} synthesized now, ${(bytes / 1024 / 1024).toFixed(2)} MB total`);
