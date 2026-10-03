# Natural voice clips (Sparky, commentator, English teacher)

Every line the game can speak is pre-generated as an MP3 with neural TTS (edge-tts) and played
through the Web Audio voice bus by `src/audio/SpeechManager.ts`. Browser speech synthesis is only a
fallback for lines without a clip.

```bash
npm run voice         # extract all lines + synthesize only the missing clips (incremental, fast)
npm run voice:prune   # same, and delete clips no longer referenced
node scripts/voice/run.mjs generate --force   # re-synthesize everything
```

Needs `edge-tts` (`pip install edge-tts`; set `EDGE_TTS=/path/to/edge-tts` if not on PATH),
`ffmpeg`/`ffprobe`, and internet while generating. The game itself plays the clips offline
(they're in `public/` and precached by the service worker).

## Pipeline
1. `extract-lines.ts` → `lines.json`: learning prompts/hints/success lines for every skill × stage ×
   many seeds × each world's tokens, all `{ text, lang }` literals in `src/game` and `src/ui`
   (speaker taken from the `say(…, 'speaker')` call), label tables (`ar:`/`en:`/`nameAr:`/`nameEn:`),
   templated lines (locked world, unlock reveal, unlock hints), counting words 1–20.
   **When you add a new spoken line, re-run `npm run voice`.**
2. `generate.mjs`: edge-tts → ffmpeg (trim silence, loudness-normalise, mono 24 kHz 40 kbps) →
   `public/audio/voice/<id>.mp3` + `manifest.json` (`index`: speaker|lang|text → id,
   `byText`: lang|text → id fallback). The clip id hashes speaker, lang, text and voice settings,
   so changing a voice in `voices.json` regenerates just those clips.

## Voices (`voices.json`, edit freely)
| speaker | voice | notes |
|---|---|---|
| sparky (Arabic) | `ar-JO-TaimNeural`, pitch +10Hz | friendly Levantine companion |
| commentator (Arabic) | `ar-SY-LaithNeural`, rate +12% | energetic match announcer |
| narrator (Arabic) | `ar-JO-SanaNeural` | warm female narrator |
| all English | `en-US-AnaNeural`, rate −5% (slow lines −20%) | one consistent child-friendly teaching voice for target words |

Alternatives worth trying: `ar-LB-RamiNeural` / `ar-SY-LaithNeural` for Sparky, `en-US-AvaNeural`
or `en-US-JennyNeural` if Ana sounds too cartoonish for target words.
