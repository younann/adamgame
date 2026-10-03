#!/usr/bin/env bash
# Download the CC0 audio sources used by scripts/audio/build-audio.py.
# Usage: scripts/audio/fetch-sources.sh <dest_dir>   (then: python3 scripts/audio/build-audio.py <dest_dir>)
# Every source below is CC0 / public domain — see docs/AUDIO_CREDITS.md.
set -euo pipefail
DEST="${1:?usage: fetch-sources.sh <dest_dir>}"
mkdir -p "$DEST/oga"
cd "$DEST"

kenney() { # name zip-url
  curl -sfL "$2" -o "$1.zip" && mkdir -p "$1" && unzip -oq "$1.zip" -d "$1"
}
kenney interface-sounds 'https://kenney.nl/media/pages/assets/interface-sounds/fa43c1dd4d-1677589452/kenney_interface-sounds.zip'
kenney impact-sounds 'https://kenney.nl/media/pages/assets/impact-sounds/87b4ddecda-1677589768/kenney_impact-sounds.zip'
kenney digital-audio 'https://kenney.nl/media/pages/assets/digital-audio/216eac4753-1677590265/kenney_digital-audio.zip'
kenney casino-audio 'https://kenney.nl/media/pages/assets/casino-audio/2472606a04-1721639069/kenney_casino-audio.zip'
kenney rpg-audio 'https://kenney.nl/media/pages/assets/rpg-audio/8e99002d76-1677590336/kenney_rpg-audio.zip'
kenney music-jingles 'https://kenney.nl/media/pages/assets/music-jingles/f37e530b9e-1677590399/kenney_music-jingles.zip'
kenney sci-fi-sounds 'https://kenney.nl/media/pages/assets/sci-fi-sounds/6b296f9ecf-1677589334/kenney_sci-fi-sounds.zip'
kenney ui-audio 'https://kenney.nl/media/pages/assets/ui-audio/490d233f68-1677590494/kenney_ui-audio.zip'
kenney voiceover 'https://kenney.nl/media/pages/assets/voiceover-pack/3f7f168698-1677589897/kenney_voiceover-pack.zip'

OGA=https://opengameart.org/sites/default/files
cd oga
for f in happy_adveture.mp3 HappyClappyLoop.mp3 fever_stadium_bpm165.ogg pixel_sprinter_loop_0.ogg \
  it_takes_a_hero.mp3 island_0.ogg Catsong.ogg Lullaby.mp3 crowd_shouting.ogg oooooooooo.ogg \
  applause-clapping-church-crowd-immersive.wav busy_cyberworld.ogg car_engine_loop_1.ogg whoosh2_0.wav \
  pop1.ogg pop2.ogg pop3.ogg pop4.ogg bell_ding1.wav bell_ding2.wav bell_ding3.wav bell_ding4.wav coin_0.ogg \
  magical_1.ogg magical_2.ogg magical_3.ogg magical_4.ogg magical_5.ogg fanfare_3.ogg theircoming.ogg \
  wave_01_cc0-18363__jasinski__alkaibeach.flac wave_02_cc0-18363__jasinski__alkaibeach.flac \
  wave_03_cc0-18363__jasinski__alkaibeach.flac wave_04_cc0-18363__jasinski__alkaibeach.flac \
  80-CC0-RPG-SFX_0.zip swishes.zip; do
  curl -sfL -A Mozilla/5.0 "$OGA/$f" -o "$f"
done
unzip -oq 80-CC0-RPG-SFX_0.zip -d rpg80
unzip -oq swishes.zip -d swishes
echo "sources ready in $DEST"
