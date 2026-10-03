#!/usr/bin/env python3
"""
Build the game's real-audio set from downloaded CC0 sources.

  1. scripts/audio/fetch-sources.sh <src_dir>      (downloads Kenney + OpenGameArt CC0 packs)
  2. python3 scripts/audio/build-audio.py <src_dir> (this script; needs ffmpeg/ffprobe)

Outputs:
  public/audio/sfx/*.mp3    mono, trimmed, peak-normalised one-shots (with variants)
  public/audio/music/*.mp3  stereo loops, loudness-normalised (-16 LUFS)
  public/audio/amb/*.mp3    mono ambience beds (-20 LUFS)
  src/audio/soundManifest.ts  generated manifest (files, durations, loop crossfades)

Every source is CC0 — see docs/AUDIO_CREDITS.md.
"""
import json
import os
import re
import subprocess
import sys
import tempfile

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
OUT = os.path.join(ROOT, "public", "audio")
SRC = os.path.abspath(sys.argv[1]) if len(sys.argv) > 1 else None
if not SRC or not os.path.isdir(SRC):
    sys.exit("usage: build-audio.py <downloaded-sources-dir>")

_index = {}


def find(pack, name):
    """Resolve a file by basename inside a source pack directory (paths contain spaces)."""
    key = (pack, name)
    if key in _index:
        return _index[key]
    base = os.path.join(SRC, pack)
    for dirpath, _, files in os.walk(base):
        if "__MACOSX" in dirpath:
            continue
        for f in files:
            if f == name or os.path.splitext(f)[0] == name:
                _index[key] = os.path.join(dirpath, f)
                return _index[key]
    raise FileNotFoundError(f"{pack}/{name}")


def K(pack, *names):
    return [find(pack, n) for n in names]


def O(*names):
    return [find("oga", n) for n in names]


def run(args):
    r = subprocess.run(args, capture_output=True, text=True)
    if r.returncode != 0:
        raise RuntimeError(" ".join(args) + "\n" + r.stderr[-2000:])
    return r


def duration(path):
    return float(run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path]).stdout.strip())


def peak_db(path):
    r = run(["ffmpeg", "-hide_banner", "-i", path, "-af", "volumedetect", "-f", "null", "-"])
    m = re.search(r"max_volume: (-?[\d.]+) dB", r.stderr)
    return float(m.group(1)) if m else 0.0


TRIM = (
    "silenceremove=start_periods=1:start_threshold=-48dB:start_silence=0.01,"
    "areverse,silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.03,areverse"
)


def make_sfx(src, dst, maxdur=None, extra=""):
    """mono, trim silence, cap length with a short fade, peak-normalise to -2 dBFS, mp3."""
    with tempfile.TemporaryDirectory() as td:
        tmp = os.path.join(td, "a.wav")
        af = TRIM
        if extra:
            af = extra + "," + af
        if maxdur:
            af += f",atrim=0:{maxdur},afade=t=out:st={max(0, maxdur - 0.08)}:d=0.08"
        run(["ffmpeg", "-y", "-hide_banner", "-i", src, "-ac", "1", "-ar", "44100", "-af", af, tmp])
        gain = -2.0 - peak_db(tmp)
        run(["ffmpeg", "-y", "-hide_banner", "-i", tmp, "-af", f"volume={gain}dB", "-ac", "1", "-b:a", "64k", dst])


def make_loop(src, dst, lufs, channels, bitrate, start=0.0, length=None, extra=""):
    af = []
    if extra:
        af.append(extra)
    if length:
        af.append(f"atrim={start}:{start + length},asetpts=PTS-STARTPTS")
    elif start:
        af.append(f"atrim={start},asetpts=PTS-STARTPTS")
    af.append(f"loudnorm=I={lufs}:TP=-1.5:LRA=11")
    run(["ffmpeg", "-y", "-hide_banner", "-i", src, "-af", ",".join(af), "-ac", str(channels), "-ar", "44100", "-b:a", bitrate, dst])


def premix(dst, layers, maxdur=None):
    """Composite one-shot: layers = [(path, delay_s, gain_db, filter)]."""
    args = ["ffmpeg", "-y", "-hide_banner"]
    for p, *_ in layers:
        args += ["-i", p]
    parts = []
    for i, (_, delay, gain, flt) in enumerate(layers):
        ms = int(delay * 1000)
        f = f"[{i}]aformat=channel_layouts=mono,aresample=44100,volume={gain}dB"
        if flt:
            f += "," + flt
        f += f",adelay={ms}[l{i}]"
        parts.append(f)
    mix = "".join(f"[l{i}]" for i in range(len(layers))) + f"amix=inputs={len(layers)}:normalize=0:duration=longest[m]"
    parts.append(mix)
    with tempfile.TemporaryDirectory() as td:
        tmp = os.path.join(td, "mix.wav")
        run(args + ["-filter_complex", ";".join(parts), "-map", "[m]", tmp])
        make_sfx(tmp, dst, maxdur=maxdur)


def gen_whistle(dst):
    """Original referee 'pea' whistle (two blasts) rendered with ffmpeg — no third-party audio."""
    expr = "0.55*sin(2*PI*2850*t+2.2*sin(2*PI*31*t))*(0.72+0.28*sin(2*PI*31*t))"
    with tempfile.TemporaryDirectory() as td:
        a = os.path.join(td, "a.wav")
        b = os.path.join(td, "b.wav")
        gap = os.path.join(td, "g.wav")
        run(["ffmpeg", "-y", "-hide_banner", "-f", "lavfi", "-i", f"aevalsrc={expr}:s=44100:d=0.22", "-af", "afade=t=in:d=0.015,afade=t=out:st=0.18:d=0.04", a])
        run(["ffmpeg", "-y", "-hide_banner", "-f", "lavfi", "-i", "anullsrc=r=44100:cl=mono", "-t", "0.09", gap])
        run(["ffmpeg", "-y", "-hide_banner", "-f", "lavfi", "-i", f"aevalsrc={expr}:s=44100:d=0.6", "-af", "afade=t=in:d=0.015,afade=t=out:st=0.48:d=0.12", b])
        lst = os.path.join(td, "l.txt")
        with open(lst, "w") as fh:
            fh.write(f"file '{a}'\nfile '{gap}'\nfile '{b}'\n")
        mix = os.path.join(td, "w.wav")
        run(["ffmpeg", "-y", "-hide_banner", "-f", "concat", "-safe", "0", "-i", lst, "-af", "highpass=f=900,aecho=0.6:0.3:18:0.18", mix])
        make_sfx(mix, dst)


# --------------------------------------------------------------------------- SFX map
# name -> (list of source files, relative volume, maxdur)
IFACE, IMPACT, DIGI, SCIFI, RPG, CASINO, JINGLE, VO = (
    "interface-sounds", "impact-sounds", "digital-audio", "sci-fi-sounds", "rpg-audio", "casino-audio", "music-jingles", "voiceover",
)

SFX = {
    "tap": (K("ui-audio", "click1", "click3"), 0.55, 0.25),
    "click": (K("ui-audio", "click2", "rollover4"), 0.5, 0.25),
    "press": (K(IFACE, "toggle_001", "toggle_002", "pluck_002"), 0.6, 0.35),
    "pop": (O("pop1.ogg", "pop3.ogg", "pop2.ogg", "pop4.ogg"), 0.8, 0.3),
    "bounce": (K(IMPACT, "impactSoft_medium_000", "impactSoft_medium_001", "impactSoft_medium_002"), 0.8, 0.4),
    "boing": (K(DIGI, "pepSound1", "pepSound3"), 0.6, 0.5),
    "whoosh": ([(find("oga", "whoosh2_0.wav"), "atrim=0:0.82,afade=t=in:d=0.05,afade=t=out:st=0.6:d=0.2"), (find("oga", "whoosh2_0.wav"), "atrim=0.88:1.9,asetpts=PTS-STARTPTS,afade=t=in:d=0.05,afade=t=out:st=0.8:d=0.2"), (find("oga", "whoosh2_0.wav"), "atrim=1.95:2.95,asetpts=PTS-STARTPTS,afade=t=in:d=0.05,afade=t=out:st=0.8:d=0.2")], 0.75, 1.0),
    "swoosh": (O("swish-9.wav", "swish-11.wav", "swish-12.wav"), 0.7, 0.7),
    "kick": (K(IMPACT, "impactPunch_heavy_000", "impactPunch_heavy_001", "impactPunch_heavy_002"), 1.0, 0.5),
    "thud": (K(IMPACT, "impactSoft_heavy_000", "impactSoft_heavy_001"), 0.8, 0.5),
    "net": (K(RPG, "cloth1", "cloth2", "cloth3"), 0.9, 0.7),
    "post": (K(IMPACT, "impactMetal_heavy_000", "impactMetal_heavy_001"), 0.8, 1.0),
    "star": (O("bell_ding1.wav", "bell_ding3.wav"), 0.6, 1.4),
    "starLand": (K(IFACE, "pluck_001", "pluck_002", "glass_001"), 0.55, 0.5),
    "coin": (O("coin_0.ogg", "item_coins_01.ogg", "item_coins_02.ogg"), 0.65, 1.0),
    "softBump": (K(IFACE, "drop_001", "drop_002", "drop_003"), 0.6, 0.4),
    "power": (K(DIGI, "powerUp2", "powerUp5", "powerUp7"), 0.55, 1.2),
    "zap": (K(DIGI, "zap1", "zap2", "laser4"), 0.55, 0.6),
    "portal": (K(SCIFI, "forceField_000", "forceField_002"), 0.7, 1.4),
    "unlock": (O("magical_1.ogg", "magical_3.ogg"), 0.7, 1.8),
    "magic": (O("magical_2.ogg", "magical_5.ogg", "magical_4.ogg"), 0.65, 1.6),
    "sparkle": (K(IFACE, "glass_004") + O("bell_ding2.wav", "bell_ding4.wav"), 0.4, 0.9),
    "nitro": (K(SCIFI, "thrusterFire_000", "thrusterFire_001", "thrusterFire_002"), 0.8, 1.2),
    "fanfare": (O("fanfare_3.ogg"), 0.75, 3.0),
    "beep": (K(DIGI, "tone1"), 0.45, 0.35),
    "go": (K(VO + "/Female" if os.path.isdir(os.path.join(SRC, VO, "Female")) else VO, "go"), 0.9, 0.9),
}

# composites (pre-mixed offline)
COMPOSITE = {
    "chest": ([(find(RPG, "creak1"), 0.0, -2, ""), (find("oga", "item_coins_03.ogg"), 0.28, -3, ""), (find("oga", "magical_2.ogg"), 0.35, -6, "")], 2.0),
    "cheer": ([(find("oga", "oooooooooo.ogg"), 0.0, 0, ""), (find("oga", "applause-clapping-church-crowd-immersive.wav"), 0.05, -2, "atrim=2:6,afade=t=out:st=3.2:d=0.8"), (find("oga", "crowd_shouting.ogg"), 0.0, -4, "atrim=0:4")], 3.8),
    "goalHorn": ([(find("oga", "theircoming.ogg"), 0.0, 0, "atrim=0:2.4,afade=t=out:st=1.9:d=0.5"), (find(JINGLE, "jingles_HIT00"), 0.05, -4, "")], 2.6),
}

MUSIC = {
    # theme: (file, start, length, crossfade, gain_db)
    "title": ("happy_adveture.mp3", 0, None, 0.5, 0),
    "map": ("HappyClappyLoop.mp3", 0, None, 0.35, 0),
    "football": ("fever_stadium_bpm165.ogg", 0, None, 1.2, -1),
    "racing": ("pixel_sprinter_loop_0.ogg", 0, None, 0.35, -1),
    "hero": ("it_takes_a_hero.mp3", 0, 78, 3.0, 0),
    "treasure": ("island_0.ogg", 0, 80, 3.0, 0),
    "closet": ("Catsong.ogg", 0, None, 0.6, 0),
    "rest": ("Lullaby.mp3", 0, 70, 4.0, -2),
}

AMB = {
    # name: (builder, crossfade)
    "crowd": (("crowd_shouting.ogg", 0, None), 1.5),
    "engine": (("car_engine_loop_1.ogg", 0, None), 0.25),
    "city": (("busy_cyberworld.ogg", 0, None), 2.0),
}


def main():
    for d in ("sfx", "music", "amb"):
        os.makedirs(os.path.join(OUT, d), exist_ok=True)
        for f in os.listdir(os.path.join(OUT, d)):
            if f.endswith(".mp3"):
                os.remove(os.path.join(OUT, d, f))
    manifest = {"sfx": {}, "music": {}, "amb": {}}

    for name, (files, vol, maxdur) in SFX.items():
        out = []
        for i, src in enumerate(files):
            fn = f"{name}_{i}.mp3"
            # an entry may be (path, pre-filter) to slice a segment out of a longer recording
            path, pre = (src if isinstance(src, tuple) else (src, ""))
            make_sfx(path, os.path.join(OUT, "sfx", fn), maxdur=maxdur, extra=pre)
            out.append(f"/audio/sfx/{fn}")
        manifest["sfx"][name] = {"files": out, "vol": vol}
        print("sfx", name, len(out))

    for name, (layers, maxdur) in COMPOSITE.items():
        fn = f"{name}_0.mp3"
        premix(os.path.join(OUT, "sfx", fn), layers, maxdur=maxdur)
        manifest["sfx"][name] = {"files": [f"/audio/sfx/{fn}"], "vol": 0.9 if name != "cheer" else 1.0}
        print("composite", name)

    fn = "whistle_0.mp3"
    gen_whistle(os.path.join(OUT, "sfx", fn))
    manifest["sfx"]["whistle"] = {"files": [f"/audio/sfx/{fn}"], "vol": 0.55}

    for theme, (src, start, length, xfade, gain) in MUSIC.items():
        dst = os.path.join(OUT, "music", f"{theme}.mp3")
        make_loop(find("oga", src), dst, -16, 2, "64k", start, length, extra=f"volume={gain}dB" if gain else "")
        manifest["music"][theme] = {"file": f"/audio/music/{theme}.mp3", "dur": round(duration(dst), 3), "xfade": xfade}
        print("music", theme, manifest["music"][theme]["dur"])

    for name, ((src, start, length), xfade) in AMB.items():
        dst = os.path.join(OUT, "amb", f"{name}.mp3")
        make_loop(find("oga", src), dst, -20, 1, "48k", start, length)
        manifest["amb"][name] = {"file": f"/audio/amb/{name}.mp3", "dur": round(duration(dst), 3), "xfade": xfade}

    # ocean bed: stitch four short wave recordings with crossfades
    with tempfile.TemporaryDirectory() as td:
        waves = [find("oga", f"wave_0{i}_cc0-18363__jasinski__alkaibeach.flac") for i in range(1, 5)]
        cur = waves[0]
        for i, w in enumerate(waves[1:]):
            nxt = os.path.join(td, f"o{i}.wav")
            run(["ffmpeg", "-y", "-hide_banner", "-i", cur, "-i", w, "-filter_complex", "acrossfade=d=0.8:c1=tri:c2=tri", "-ac", "1", nxt])
            cur = nxt
        dst = os.path.join(OUT, "amb", "ocean.mp3")
        make_loop(cur, dst, -22, 1, "48k")
        manifest["amb"]["ocean"] = {"file": "/audio/amb/ocean.mp3", "dur": round(duration(dst), 3), "xfade": 1.2}

    write_manifest(manifest)
    total = sum(os.path.getsize(os.path.join(dp, f)) for dp, _, fs in os.walk(OUT) for f in fs if f.endswith(".mp3") and "/voice" not in dp)
    print(f"total {total / 1e6:.2f} MB")


def write_manifest(m):
    path = os.path.join(ROOT, "src", "audio", "soundManifest.ts")
    with open(path, "w") as fh:
        fh.write("// GENERATED by scripts/audio/build-audio.py — do not edit by hand.\n")
        fh.write("// All audio is CC0 (see docs/AUDIO_CREDITS.md) or generated in-house.\n\n")
        fh.write("export interface SfxEntry {\n  files: string[];\n  vol: number;\n}\n")
        fh.write("export interface LoopEntry {\n  file: string;\n  /** encoded duration in seconds */\n  dur: number;\n  /** crossfade used when looping (s) */\n  xfade: number;\n}\n\n")
        fh.write("export const SFX_SAMPLES: Record<string, SfxEntry> = " + json.dumps(m["sfx"], indent=2) + ";\n\n")
        fh.write("export const MUSIC_SAMPLES: Record<string, LoopEntry> = " + json.dumps(m["music"], indent=2) + ";\n\n")
        fh.write("export const AMB_SAMPLES: Record<string, LoopEntry> = " + json.dumps(m["amb"], indent=2) + ";\n")
    print("wrote", path)


if __name__ == "__main__":
    main()
