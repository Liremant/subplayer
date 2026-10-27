#!/usr/bin/env bash
# Imports a "video + two-language subtitles" drop into media/.
#
#   import.sh <video-archive.zip> <subs-ru-dir> <subs-original-dir> [media-root]
#
# <video-archive.zip>   episodes as .mkv/.avi/.mp4, named `...-02x05...`
# <subs-ru-dir>         `<name>.S02E05.rus.srt`
# <subs-original-dir>   small zips holding the original-language `.srt`
#
# Every episode becomes media/<Series>/<Season>/<Episode>/{video.mp4,subs.vtt,meta.json}.
# Episodes are pulled out one at a time and deleted after conversion, so the import never
# needs room for the whole archive (the drop here is 5.7 GB on a disk with 4 GB free).
set -euo pipefail
cd "$(dirname "$0")/.."

ARCHIVE=${1:?usage: import.sh <video-archive.zip> <subs-ru-dir> <subs-original-dir> [media-root]}
RUS_DIR=${2:?usage: import.sh <video-archive.zip> <subs-ru-dir> <subs-original-dir> [media-root]}
ORIG_DIR=${3:?usage: import.sh <video-archive.zip> <subs-ru-dir> <subs-original-dir> [media-root]}
ROOT=${4:-media}
SERIES="Breaking Bad"

WORK=$PWD/.import-tmp
rm -rf "$WORK"
mkdir -p "$WORK/orig"
trap 'rm -rf "$WORK"' EXIT

# Original-language subtitles live in their own little archives. "forced" tracks carry a
# couple of lines of signage, not dialogue — they are not a translation source.
for z in "$ORIG_DIR"/*.zip; do
  [ -f "$z" ] || continue
  python3 - "$z" "$WORK/orig" <<'PY'
import sys, zipfile, os
src, dst = sys.argv[1], sys.argv[2]
with zipfile.ZipFile(src) as z:
    for info in z.infolist():
        name = os.path.basename(info.filename)
        if name.lower().endswith('.srt') and 'forced' not in name.lower():
            with z.open(info) as f, open(os.path.join(dst, name), 'wb') as out:
                out.write(f.read())
PY
done

# Read the list into an array first: ffmpeg and unzip read stdin, and a `while read`
# loop fed by a pipe loses its remaining lines the moment a child consumes them.
mapfile -t entries < <(python3 scripts/unzip-one.py list "$ARCHIVE")

for row in "${entries[@]}"; do
  index=${row%%$'\t'*}
  entry=${row#*$'\t'}
  base=$(basename "$entry")
  season=$(sed -n 's/.*-0*\([0-9]\+\)x0*\([0-9]\+\).*/\1/p' <<<"$base")
  ep=$(sed -n 's/.*-0*\([0-9]\+\)x0*\([0-9]\+\).*/\2/p' <<<"$base")
  [ -n "${ep:-}" ] || continue
  printf -v season2 '%02d' "$season"
  printf -v ep2 '%02d' "$ep"
  out="$ROOT/$SERIES/S$season2/E$ep2"
  mkdir -p "$out"

  echo "== S${season2}E${ep2}  <- $base"
  if [ -s "$out/video.mp4" ]; then
    echo "   video: already imported, skipping"
  else
    src="$WORK/current.${base##*.}"
    python3 scripts/unzip-one.py extract "$ARCHIVE" "$index" "$src" < /dev/null
    # mp4 wants h264 + aac + faststart to seek; mpeg4-in-avi does not play in a browser.
    # Encode to a temp name: a half-written video.mp4 would show up in the catalog
    # (and be playable, and broken) while the import is still running.
    ffmpeg -nostdin -y -v error -i "$src" \
      -map 0:v:0 -map 0:a:0 \
      -c:v libx264 -preset veryfast -crf 28 -pix_fmt yuv420p \
      -c:a aac -b:a 128k -ac 2 \
      -movflags +faststart \
      "$out/.video.mp4.part"
    mv "$out/.video.mp4.part" "$out/video.mp4"
    rm -f "$src"
    echo "   video: $(du -h "$out/video.mp4" | cut -f1)"
  fi

  ru=$(find "$RUS_DIR" -maxdepth 1 -type f -iname "*s02e${ep2}*.rus.srt" -print -quit)
  de=$(find "$WORK/orig" -maxdepth 1 -type f -iname "*s02e${ep2}*.srt" -print -quit)
  if [ -n "${ru:-}" ] && [ -n "${de:-}" ]; then
    python3 scripts/merge-subs.py "$de" "$ru" -o "$out/subs.vtt" < /dev/null
  elif [ -n "${ru:-}" ]; then
    python3 scripts/merge-subs.py "$ru" -o "$out/subs.vtt" < /dev/null
  else
    echo "   no subtitles for S${season2}E${ep2}"
  fi

  printf '{ "title": "%s", "year": 2008 }\n' "$SERIES" > "$out/meta.json"
done

echo "done"
