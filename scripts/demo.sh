#!/usr/bin/env bash
# Regenerates the demo library: two series episodes (one VTT, one SRT) and one movie.
# The catalog is empty until you either run this or drop your own files into media/.
set -euo pipefail
cd "$(dirname "$0")/.."

mkdir -p "media/Dune (2021)" "media/Breaking Bad/S01/E01" "media/Breaking Bad/S01/E02"

for dir in "Dune (2021)" "Breaking Bad/S01/E01" "Breaking Bad/S01/E02"; do
  [ -f "media/$dir/video.mp4" ] && continue
  ffmpeg -y -loglevel error \
    -f lavfi -i "testsrc=size=640x360:rate=10:duration=30" \
    -f lavfi -i "anullsrc=r=44100:cl=stereo" -shortest \
    -c:v libx264 -preset ultrafast -pix_fmt yuv420p -c:a aac -movflags +faststart \
    "media/$dir/video.mp4"
done

cat > "media/Dune (2021)/meta.json" <<'JSON'
{ "kind": "movie", "title": "Dune", "year": 2021, "duration": 30 }
JSON
cat > "media/Breaking Bad/S01/E02/meta.json" <<'JSON'
{ "title": "Breaking Bad", "year": 2008, "duration": 30 }
JSON

echo "demo library ready: $(find media -name video.mp4 | wc -l) videos"
