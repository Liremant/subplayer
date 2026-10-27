# AGENTS.md

Rules for any agent — or person — working in this repository without prior context. Read it
in full before making the first edit.

## 1. What this project is

A personal video player: local files, dual-language subtitles, a cue panel, subtitle search,
and timing shift. One user, one server, a local network. There are no accounts, no database,
and no external metadata catalogue; the library is the filesystem.

It was inspired by [2sub.movie](https://2sub.movie) and is an independent implementation. No
code, markup, stylesheet, asset or copy was taken from that site — see §9.

```
src/                 Rust backend (axum)
  main.rs            routes, static files, SPA fallback
  library.rs         scans media/ into movies + series, meta.json, path inference
  mp4.rs             duration from moov/mvhd
  store.rs           settings.json / progress.json, clamping, atomic writes
  posters.rs         poster search (TVmaze, iTunes) and download
web/src/             React 19 + Vite 8 + TypeScript
  App.tsx            routing: / · /s/:series · /w/:item · /settings
  Catalog.tsx        card grid, filters, sorting
  Series.tsx         series page, episodes by season
  Player.tsx         assembles the player: skin, overlay, panel, keys
  PlayerKeys.tsx     every keyboard shortcut (matched by event.code)
  PlayerSettings.tsx in-player settings panel
  SubtitleOverlay.tsx  two lines over the video, draggable
  SubtitleList.tsx   side cue panel
  FloatingPanel.tsx  dialogue column in fullscreen
  StageShell.tsx     the element fullscreen targets
  subtitle.ts        VTT/SRT parsing, cue search
  useCenterActive.ts keeps the active cue centred
scripts/             media import and subtitle merging (python + bash)
```

## 2. Scope and non-goals

Required, and verified before any release:

1. **Catalogue** — one grid of poster cards, no sections; the type filter (`all / films /
   series`) does the splitting. Search by title, sorting by recently watched, alphabetical or
   recently added. A card shows the poster, the title, a progress line ("resume at 12:41",
   "S01E02 · start", "watched") and, on its own line, metadata.
2. **Player page** — playback, seeking, speed, volume, fullscreen, keyboard shortcuts, and a
   remembered playback position.
3. **Subtitles** — both languages at once, modes original / translation / both / off, text
   size and free placement, timing shift, optional previous cue.
4. **Cue panel** — every cue listed beside the video; clicking one seeks to it; the active
   cue is highlighted and kept in view.
5. **Subtitle search** — with highlighting and navigation to the match.
6. **Your own files** — drop `.mp4` and `.vtt`/`.srt` into a folder and the service sees them.
7. **Series page** — poster, title, year, seasons, "watched N of M", a resume button, and
   episodes by season with progress.
8. **Posters** — a local image, or search and download from a free key-less source.
9. **Settings** — a separate screen holding only what has no better home; subtitle settings
   live in the player.

Deliberately out of scope. Not "never", but not now — the core viewing experience comes first:

- accounts, registration, roles, permissions;
- dictionary, click-a-word, flashcards, Anki;
- translator workflow, translation ratings, moderation;
- automatic subtitle acquisition (Bazarr, subliminal) and ASR;
- a film catalogue with TMDB metadata, recommendations;
- transcoding on the fly, adaptive HLS;
- mobile apps, Cast, AirPlay;
- uploading files through the UI;
- multiple subtitle versions per episode;
- editing metadata through the UI.

If a task requires something from that list, ask first, then build.

## 3. Git: one feature, one branch

**Never commit directly to `main`.** One feature = one branch = one merge.

```sh
git switch -c feat/subtitle-drag     # from a fresh main
# … work, small commits along the way …
git switch main && git merge --no-ff feat/subtitle-drag
git branch -d feat/subtitle-drag
```

- Branch names: `feat/…`, `fix/…`, `chore/…`, `docs/…`, hyphenated, in English.
- One branch is one finished thing. Two unrelated changes belong in two branches.
- Merge into `main` only when the feature is complete and verified (§6).
- `main` must build and run at every commit.
- Commit messages: `<area>: <what changed>`, imperative mood, no trailing period.
  `player: hold subtitle highlight through cue gaps`, `library: group episodes into series`.
- Do not push to `main` around the branch, not even for a one-line fix.

## 4. Hard constraints

These are not preferences. Breaking one breaks behaviour that has already been verified.

### Subtitles

- **One file per episode**, both languages in every cue, the original in `<b>`. Not two
  tracks, not two files side by side. The two languages are segmented into cues differently,
  so combining two independent tracks by index or timestamp fails on real data.
- **Only the client parses subtitles** (`web/src/subtitle.ts`). Rust does not parse them and
  serves the file as-is. Two parsers for one format inevitably diverge.
- **Do not use the native `<track>` element.** It cannot render two lines, a custom size, a
  timing shift, or highlighting.
- Timing shift is the main feature. Any change to the overlay must preserve the modes
  (both / original / translation / off), the shift, the size, and free placement.
- Cue timings in the panel are shown **with the shift applied** (`cue.start + shift`), never
  raw.

### Media

- The browser plays only `h264 + aac` in `mp4` with the `moov` atom at the start. Everything
  else needs transcoding (`scripts/import.sh`). Do not try to optimise this away.
- Serve files only through `ServeDir`/`ServeFile` from `tower-http`. It already handles
  `Range`, 206 and `Content-Range`. **Do not hand-roll Range** — seeking breaks silently.
- The catalogue is built from metadata, not from the directory structure. A folder without
  `meta.json` must still appear in the library, with name and year inferred from its path.

### Frontend

- Shortcuts match on **`event.code`**, never `event.key`. The Video.js skin registers its own
  hotkeys by `key`, which do nothing on a Cyrillic layout; our layer listens in the capture
  phase and stops the event. Do not add `Hotkey` from the package — it would double-fire.
- The player is one screen on desktop (`height: 100dvh`, `overflow: hidden`), with the cue
  list scrolling inside itself. Without this the page grows to tens of thousands of pixels.
- Auto-scroll the cue list only through `useCenterActive`. `scrollIntoView` also scrolls the
  document, which has already broken the page once.

## 5. Documentation: two languages

`README.md` is **English and the default**. `README.ru.md` is the Russian version. Both carry
a switch in the header: `[Русский](README.ru.md)` / `[English](README.md)`.

- A change to user-facing documentation goes into **both files in the same commit**. Drift is
  worse than a missing translation.
- Section structure and anchors match in both files, so switching language keeps your place.
- `docs/ADDING-MEDIA.md` (English) and `docs/ADDING-MEDIA.ru.md` (Russian) are the same pair.
- `AGENTS.md` is English; it is an internal document and is not mirrored.
- Register is formal: no slang, no "your files" phrasing. Instructions in the imperative,
  capabilities in declarative sentences.

## 6. Checks before merging

All of the following must pass. If a check was not run, say so in the pull request.

```sh
cargo test                                    # backend: scan, path parsing, mvhd, store
cargo fmt --check
cargo clippy --all-targets -- -D warnings
cd web && npx tsc --noEmit                    # types
cd web && node --experimental-strip-types src/subtitle.check.ts   # parser self-check
cd web && pnpm build                          # frontend bundle
cargo build --release                         # binary
```

By hand, on a real episode with real subtitles:

1. The episode appears in the catalogue, with poster and progress.
2. It plays, both lines are visible, the modes switch.
3. Shifting by ±1.5 s moves both the overlay and the panel timings.
4. Clicking a cue seeks exactly where the label says.
5. Search finds the text, highlights it, and Enter navigates to it.
6. Reloading the page resumes from the same position.
7. Fullscreen: the dialogue column sits beside the video, nothing is covered, the active cue
   is centred.
8. Shortcuts work on a **Cyrillic** layout.

## 7. Running locally

```sh
./scripts/demo.sh                    # demo library (ffmpeg) when media/ is empty
cargo build --release
systemctl --user restart subplayer   # if the unit is installed — it holds :3000
```

Or manually: `./target/release/subplayer` (port 3000, loopback only). For frontend work:
`cd web && pnpm dev`, which proxies `/api` and `/media` to port 3000.

**Port 3000 may be held by the systemd unit** `subplayer.service`, which is configured with
`Restart=always`. If `cargo run` fails with `AddrInUse`, that is the cause. Restart it with
`systemctl --user restart` rather than killing the process.

## 8. Code style

- **Less code is better.** Do not add a dependency for a few lines; the standard library and
  the packages already installed cover nearly everything.
- Backend: no database, no migrations, no ORM. State lives in JSON files under `data/`.
- Frontend: no router library (three routes on the History API), no state manager, no UI kit.
  Everything needed is in `styles.css`.
- Comment only where it explains **why**, not what. One line.
- A known limitation is marked `shortcut: <limit>, <when to fix>`.
- Do not rename or "tidy" unrelated modules along the way. Drive-by edits are noise.

### Tokens and layout

- Colours and fonts only through `var(--…)` from `web/src/styles.css`. No inline hex or
  `oklch()` in components.
- One accent, neutrals tinted toward it, never pure `#000` or `#fff`.
- `font-variant-numeric: tabular-nums` on any number that changes.
- No animation on high-frequency actions (clicking a cue, shortcuts) — colour and background
  only. The 200 ms highlight transition between cues is a deliberate exception.
- Mobile floor: 320 / 375 / 414 / 768 px with no horizontal scrolling.

## 9. Attribution

The interface was inspired by 2sub.movie. That is the whole of the relationship: the idea of
watching a film with both the original line and its translation, and a cue panel beside the
video, is what was borrowed.

Everything in this repository is original work. Nothing was copied — not code, not markup,
not stylesheets, not images, not text. The stack is different (Rust, React, Video.js), the
data model is different (one subtitle file with both languages per cue), and the feature set
is deliberately smaller: no catalogue of translations, no users, no paywall.

When discussing the project publicly, credit 2sub.movie as the inspiration and be explicit
that this is an independent implementation. Do not imply affiliation, endorsement, or
partnership.
