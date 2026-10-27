# Adding media

[Русский](ADDING-MEDIA.ru.md) · **English**

In short: **place a directory containing `video.mp4` inside `media/` and reload the page.**
Nothing needs to be imported, registered, or restarted.

```
subplayer/
  media/                 ← here
    Dune.2021/
      video.mp4
    Breaking Bad/
      S02/
        E05/
          video.mp4
```

Open <http://127.0.0.1:3000> and reload the page.

## Directory contents

| File | Required | Purpose |
|---|---|---|
| `video.mp4` | **yes** | the video. Any file name; extension `.mp4`, `.m4v` or `.webm` |
| `subs.vtt` | no | subtitles, both languages in one file |
| `meta.json` | no | title, year, type — when the directory name is not enough |
| `poster.jpg` | no | cover image |

A directory without `meta.json` or subtitles is still valid; the card simply shows no
subtitle track.

## Supported video

The player does not transcode on the fly. The browser plays the file as-is, so it must be
**`h264` video with `aac` audio in an `mp4` container**, and the `moov` atom (the index) must
be at the start of the file — otherwise seeking is slow.

Verify:

```sh
ffprobe -v error -show_entries stream=codec_name,codec_type -of csv=p=0 video.mp4
# expected: h264, video  /  aac, audio
```

Convert:

```sh
ffmpeg -i input.mkv -c:v libx264 -preset veryfast -crf 23 -pix_fmt yuv420p \
       -c:a aac -b:a 160k -movflags +faststart video.mp4
```

`-movflags +faststart` places the `moov` atom at the start. Without it the video plays, but
each seek takes seconds.

**Not playable without conversion:** `.mkv` (the codecs inside vary), `.avi` with `mpeg4`,
`hevc`/`h265` (Chrome on Windows often refuses it), `ac3`/`dts` audio.

## Subtitles

One file per video, both languages in each cue, the original marked with `<b>`:

```
WEBVTT

1
00:00:01.000 --> 00:00:03.000
<b>I am the one who knocks</b>
Я тот, кто стучится
```

One file rather than two tracks, because the two languages are segmented into cues
differently and combining two independent files by index fails at the first discrepancy.

Merge two `.srt` files into this format:

```sh
python3 scripts/merge-subs.py subs.en.srt subs.ru.srt -o subs.vtt
```

The script estimates the offset and scaling between releases. If the timings are known to be
identical, pass `--no-warp`.

For a single-language track, place the `.srt` as `subs.srt` — both `.vtt` and `.srt` are
parsed.

If the subtitles are out of sync with the video, do not edit the file: the player provides
`[` and `]` to shift by 0.5 s, and the shift is remembered per video.

## Metadata

Without `meta.json`, everything is derived from the directory name:

| Directory | Result |
|---|---|
| `Dune.2021.1080p.BluRay.x264-GRP` | film "Dune", 2021 — release tags discarded |
| `Dune (2021)` | film "Dune", 2021 |
| `Breaking Bad/S02/E05` | series "Breaking Bad", season 2, episode 5 |
| `Breaking Bad/2x05` | the same |
| `Some.Movie.1080p.WEB-DL` | film "Some Movie" |

If the result is wrong, add `meta.json`:

```json
{
  "kind": "movie",
  "title": "Dune",
  "year": 2021
}
```

| Field | Values | Default |
|---|---|---|
| `kind` | `movie` / `episode` | `episode` when the path contains a season and episode |
| `title` | string | derived from the directory name |
| `series` | string | equal to `title` |
| `season`, `episode` | numbers | derived from the path |
| `year` | number | derived from the directory name |
| `duration` | seconds | read from the file |
| `poster` | path | `poster.*` in the directory |

**A series is a name, not a directory.** Every episode sharing a `series` value (or the same
derived name) is grouped into one card. The layout is free: `Breaking Bad/S02/E05/`,
`Breaking Bad/2x05/` and `breaking-bad-s02e05/` all belong to the same series.

## Posters

Two options:

1. **Local image** — place `poster.jpg` (or `.png`, `.webp`) next to the video. For a series,
   place it in the shared directory: `media/Breaking Bad/poster.jpg`.
2. **From the network** — the "Обложка" button in the player or on the series page. It
   searches TVmaze (series) and iTunes (films) and downloads the selection into
   `data/posters/`.

Downloaded posters are stored locally, so the library looks the same without a network
connection. A file in the media directory takes precedence over a downloaded one.

## Troubleshooting

1. **Is the directory inside `media/`?** Only that root is scanned. A different root is set
   with `SUBPLAYER_MEDIA`.
2. **Does the directory contain a video file?** Any name with an `.mp4`, `.m4v` or `.webm`
   extension is accepted, but only one video per directory — otherwise the first one found is
   used.
3. **Does the directory name start with a dot?** Hidden directories are skipped.
4. **Reload the page.** The catalogue is read on every request; no restart is needed.
5. **Check the service log:** `journalctl --user -u subplayer -n 20`.

Inspect what the server sees, without a browser:

```sh
curl -s localhost:3000/api/library | python3 -m json.tool | head -40
```

## Bulk import

Given an archive of episodes and separate subtitle directories:

```sh
./scripts/import.sh release.zip ~/Downloads/subs-ru ~/Downloads
```

The script extracts **one episode at a time** (about 1 GB of free space is needed rather than
the size of the whole archive), transcodes to `mp4`, merges the subtitles and writes
`meta.json`. Episodes already imported are skipped.

## Application state

`data/`, next to the binary: `progress.json` (playback positions), `settings.json`
(preferences), `posters/` (downloaded covers). The directory can be deleted — the library is
rescanned, but progress and settings are lost.

The `media/` tree is only ever read. The service never writes to or deletes from it.
