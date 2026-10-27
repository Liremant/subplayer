use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::path::Path;
use std::time::UNIX_EPOCH;
use walkdir::WalkDir;

const VIDEO_EXTS: [&str; 3] = ["mp4", "m4v", "webm"];
const SUBS_NAMES: [&str; 4] = ["subs.vtt", "subs.srt", "video.vtt", "video.srt"];
const POSTER_EXTS: [&str; 5] = ["jpg", "jpeg", "png", "webp", "avif"];

#[derive(Serialize, Deserialize, Clone, Copy, PartialEq, Debug)]
#[serde(rename_all = "lowercase")]
pub enum Kind {
    Movie,
    Episode,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Item {
    /// Path of the folder relative to the media root, `/`-separated. Stable key for progress.
    pub id: String,
    pub kind: Kind,
    /// Series name for episodes, own name for movies.
    pub title: String,
    pub series: Option<String>,
    pub season: Option<u32>,
    pub episode: Option<u32>,
    pub year: Option<u32>,
    pub duration: Option<f64>,
    /// Seconds since the epoch of the video file — "recently added" sorting.
    pub added: u64,
    /// Media-relative paths, ready to append to `/media/`.
    pub video: String,
    pub subs: Option<String>,
    /// URL path: `/media/...` for a file in the folder, `/posters/...` for a downloaded one.
    pub poster: Option<String>,
    /// Filled in by the server from progress.json; `None` means never watched.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub progress: Option<crate::store::Progress>,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Series {
    /// Slug of the series name; the route is `/s/<id>` and the poster file is `<id>.jpg`.
    pub id: String,
    pub title: String,
    pub year: Option<u32>,
    pub poster: Option<String>,
    pub seasons: u32,
    pub duration: Option<f64>,
    pub episodes: Vec<Item>,
}

#[derive(Serialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct Library {
    pub movies: Vec<Item>,
    pub series: Vec<Series>,
}

/// Hand-written `meta.json` next to the video. Every field is optional: whatever is
/// missing is inferred from the folder path, so a bare `video.mp4` folder still works.
#[derive(Deserialize, Default)]
#[serde(default)]
struct Meta {
    kind: Option<Kind>,
    title: Option<String>,
    series: Option<String>,
    season: Option<u32>,
    episode: Option<u32>,
    year: Option<u32>,
    duration: Option<f64>,
    poster: Option<String>,
}

/// Walks `root`, turns every folder holding a video into an `Item`, then folds episodes
/// into their series. `poster_dir` holds posters downloaded through the UI.
pub fn scan(root: &Path, poster_dir: &Path) -> Library {
    let items: Vec<Item> = WalkDir::new(root)
        .sort_by_file_name()
        .into_iter()
        .filter_entry(|e| !is_hidden(e.path()))
        .filter_map(Result::ok)
        .filter(|e| e.file_type().is_dir())
        .filter_map(|e| item_from_dir(root, poster_dir, e.path()))
        .collect();

    let mut movies: Vec<Item> = Vec::new();
    let mut grouped: BTreeMap<String, Vec<Item>> = BTreeMap::new();
    for item in items {
        match item.kind {
            Kind::Movie => movies.push(item),
            Kind::Episode => {
                let key = item.series.clone().unwrap_or_else(|| item.title.clone());
                grouped.entry(key).or_default().push(item);
            }
        }
    }

    let series = grouped
        .into_iter()
        .map(|(name, mut episodes)| {
            episodes.sort_by_key(|e| (e.season, e.episode));
            let slug = crate::posters::slug(&name);
            let year = episodes.iter().find_map(|e| e.year);
            let durations: Vec<f64> = episodes.iter().filter_map(|e| e.duration).collect();
            Series {
                poster: series_poster(root, poster_dir, &slug, &episodes),
                id: slug,
                title: name,
                year,
                // Distinct seasons with episodes, not the highest season number: a library
                // holding only season 2 must not claim two seasons.
                seasons: {
                    let mut seen: Vec<u32> = episodes.iter().filter_map(|e| e.season).collect();
                    seen.sort_unstable();
                    seen.dedup();
                    seen.len().max(1) as u32
                },
                duration: (!durations.is_empty()).then(|| durations.iter().sum()),
                episodes,
            }
        })
        .collect();

    movies.sort_by_key(|m| m.title.to_lowercase());
    Library { movies, series }
}

fn is_hidden(path: &Path) -> bool {
    path.file_name()
        .and_then(|n| n.to_str())
        .is_some_and(|n| n.starts_with('.'))
}

fn item_from_dir(root: &Path, poster_dir: &Path, dir: &Path) -> Option<Item> {
    let video = std::fs::read_dir(dir)
        .ok()?
        .filter_map(Result::ok)
        .find(|f| {
            f.path().is_file()
                && f.path()
                    .extension()
                    .and_then(|e| e.to_str())
                    .is_some_and(|e| VIDEO_EXTS.contains(&e.to_lowercase().as_str()))
        })?;
    let rel_dir = dir.strip_prefix(root).ok()?;
    let id = rel_dir.to_string_lossy().replace('\\', "/");
    let subs = SUBS_NAMES.iter().map(|n| dir.join(n)).find(|p| p.is_file());

    let guessed = guess_from_path(&id);
    let meta: Meta = std::fs::read_to_string(dir.join("meta.json"))
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default();

    let season = meta.season.or(guessed.season);
    let episode = meta.episode.or(guessed.episode);
    let kind = meta.kind.unwrap_or(if episode.is_some() {
        Kind::Episode
    } else {
        Kind::Movie
    });
    let title = meta
        .title
        .or(guessed.title)
        .unwrap_or_else(|| id.rsplit('/').next().unwrap_or(&id).to_string());

    let video_path = video.path();
    Some(Item {
        id: id.clone(),
        kind,
        series: if kind == Kind::Episode {
            Some(meta.series.unwrap_or_else(|| title.clone()))
        } else {
            None
        },
        title,
        season,
        episode,
        year: meta.year.or(guessed.year),
        duration: meta.duration.or_else(|| crate::mp4::duration(&video_path)),
        added: modified(&video_path),
        video: format!("{id}/{}", video.file_name().to_string_lossy()),
        subs: subs.map(|p| format!("{id}/{}", p.file_name().unwrap().to_string_lossy())),
        // A file dropped in the folder is explicit user intent, so it beats a download.
        poster: meta
            .poster
            .map(|p| format!("/media/{}", p.trim_start_matches('/')))
            .or_else(|| folder_poster(dir).map(|p| format!("/media/{id}/{p}")))
            .or_else(|| {
                let slug = crate::posters::slug(id.rsplit('/').next().unwrap_or(&id));
                crate::posters::existing(poster_dir, &slug).map(|name| format!("/posters/{name}"))
            }),
        progress: None,
    })
}

/// A poster file dropped next to the video wins over anything downloaded.
fn folder_poster(dir: &Path) -> Option<String> {
    POSTER_EXTS
        .iter()
        .map(|ext| dir.join(format!("poster.{ext}")))
        .find(|p| p.is_file())
        .and_then(|p| p.file_name().map(|n| n.to_string_lossy().into_owned()))
}

/// Series posters live in `data/posters/<slug>.<ext>`, or in the folder all episodes share.
fn series_poster(root: &Path, poster_dir: &Path, slug: &str, episodes: &[Item]) -> Option<String> {
    if let Some(name) = crate::posters::existing(poster_dir, slug) {
        return Some(format!("/posters/{name}"));
    }
    let common = series_folder(episodes.iter().map(|e| e.id.as_str()))?;
    folder_poster(&root.join(&common)).map(|name| format!("/media/{common}/{name}"))
}

/// The folder a series' own poster would live in: `Breaking Bad/S01/E01` and
/// `Breaking Bad/S01/E02` both give `Breaking Bad`, and a lone `Breaking Bad/S01/E01`
/// gives `Breaking Bad` too (trailing season/episode segments are dropped).
fn series_folder<'a>(ids: impl Iterator<Item = &'a str>) -> Option<String> {
    let mut prefix: Option<Vec<&str>> = None;
    for id in ids {
        let parts: Vec<&str> = id.split('/').collect();
        prefix = Some(match prefix {
            None => parts,
            Some(prev) => prev
                .into_iter()
                .zip(parts)
                .take_while(|(a, b)| a == b)
                .map(|(a, _)| a)
                .collect(),
        });
    }
    let mut parts = prefix?;
    while parts.last().is_some_and(|p| parse_se(p) != (None, None)) {
        parts.pop();
    }
    (!parts.is_empty()).then(|| parts.join("/"))
}

fn modified(path: &Path) -> u64 {
    std::fs::metadata(path)
        .and_then(|m| m.modified())
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

#[derive(Default, Debug, PartialEq)]
struct Guess {
    title: Option<String>,
    season: Option<u32>,
    episode: Option<u32>,
    year: Option<u32>,
}

/// `Breaking Bad/S01/E01` → series "Breaking Bad", season 1, episode 1.
/// `Dune.2021.1080p.BluRay.x264-GRP` → title "Dune", year 2021.
fn guess_from_path(id: &str) -> Guess {
    let parts: Vec<&str> = id.split('/').collect();
    let mut season = None;
    let mut episode = None;
    for part in parts.iter().rev().take(2) {
        let (s, e) = parse_se(part);
        season = season.or(s);
        episode = episode.or(e);
    }
    // Name = the part that carries no season/episode marker, else the folder itself.
    let name_part = parts
        .iter()
        .find(|p| parse_se(p) == (None, None))
        .copied()
        .unwrap_or_else(|| parts.last().copied().unwrap_or(id));

    let (title, year) = clean_name(name_part);
    Guess {
        title,
        season,
        episode,
        year,
    }
}

/// Strips scene-release noise: `Dune.2021.1080p.BluRay.x264-GRP` → ("Dune", 2021).
fn clean_name(raw: &str) -> (Option<String>, Option<u32>) {
    let tokens: Vec<&str> = raw
        .split(['.', '_', ' '])
        .filter(|t| !t.is_empty())
        .collect();
    if tokens.is_empty() {
        return (None, None);
    }
    // `Dune (2021)` and `Dune.2021` both carry the year; only the wrapping differs.
    let year_at = tokens.iter().position(|t| is_year(bare(t)));
    let (head, year) = match year_at {
        Some(at) => (&tokens[..at], bare(tokens[at]).parse().ok()),
        None => (&tokens[..], None),
    };
    // Trailing tags ("1080p", "x264") sit after the title when there is no year.
    let end = head
        .iter()
        .rposition(|t| !is_tag(t))
        .map(|i| i + 1)
        .unwrap_or(0);
    let title = head[..end].join(" ");
    let title = title.trim().trim_matches('-').trim();
    ((!title.is_empty()).then(|| title.to_string()), year)
}

fn bare(token: &str) -> &str {
    token.trim_matches(['(', ')', '[', ']'])
}

fn is_year(token: &str) -> bool {
    token.len() == 4
        && token.chars().all(|c| c.is_ascii_digit())
        && token
            .parse::<u32>()
            .is_ok_and(|y| (1880..=2100).contains(&y))
}

fn is_tag(token: &str) -> bool {
    const TAGS: [&str; 24] = [
        "480p", "720p", "1080p", "2160p", "4k", "bluray", "blu-ray", "brrip", "bdrip", "webrip",
        "web-dl", "web", "hdtv", "dvdrip", "remux", "x264", "x265", "h264", "h265", "hevc", "av1",
        "aac", "ac3", "10bit",
    ];
    let lower = token.to_lowercase();
    TAGS.contains(&lower.as_str())
        || lower.starts_with("ddp")
        || lower.starts_with("dts")
        || (lower.contains('x') && lower.split('x').all(|p| p.parse::<u32>().is_ok()))
}

/// Recognises `s01`, `e01`, `S01E01`, `1x01`.
fn parse_se(text: &str) -> (Option<u32>, Option<u32>) {
    let lower = text.to_lowercase();
    if let Some((a, b)) = lower.split_once('x') {
        if let (Some(s), Some(e)) = (digits(a), digits(b)) {
            return (Some(s), Some(e));
        }
    }
    if let Some(pos) = lower.find('e') {
        let (left, right) = (&lower[..pos], &lower[pos + 1..]);
        if let (Some(s), Some(e)) = (tagged(left, 's'), digits(right)) {
            return (Some(s), Some(e));
        }
    }
    (tagged(&lower, 's'), tagged(&lower, 'e'))
}

fn tagged(text: &str, prefix: char) -> Option<u32> {
    let rest = text.strip_prefix(prefix)?;
    digits(rest)
}

fn digits(text: &str) -> Option<u32> {
    if text.is_empty() || !text.chars().all(|c| c.is_ascii_digit()) {
        return None;
    }
    text.parse().ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_season_episode_shapes() {
        assert_eq!(parse_se("S01"), (Some(1), None));
        assert_eq!(parse_se("E02"), (None, Some(2)));
        assert_eq!(parse_se("S01E03"), (Some(1), Some(3)));
        assert_eq!(parse_se("1x03"), (Some(1), Some(3)));
        assert_eq!(parse_se("Breaking Bad"), (None, None));
        assert_eq!(parse_se("Dune (2021)"), (None, None));
        assert_eq!(parse_se("Season 1"), (None, None));
    }

    #[test]
    fn strips_scene_release_noise() {
        assert_eq!(
            clean_name("Dune.2021.1080p.BluRay.x264-GRP"),
            (Some("Dune".into()), Some(2021))
        );
        assert_eq!(
            clean_name("The.Matrix.1999.2160p.UHD.BluRay.x265"),
            (Some("The Matrix".into()), Some(1999))
        );
        assert_eq!(clean_name("Dune (2021)"), (Some("Dune".into()), Some(2021)));
        assert_eq!(
            clean_name("Arrival 2016"),
            (Some("Arrival".into()), Some(2016))
        );
        assert_eq!(
            clean_name("Some.Movie.1080p.WEB-DL"),
            (Some("Some Movie".into()), None)
        );
        assert_eq!(
            clean_name("Breaking Bad"),
            (Some("Breaking Bad".into()), None)
        );
        assert_eq!(clean_name(""), (None, None));
    }

    #[test]
    fn guesses_hierarchy_and_movies() {
        assert_eq!(
            guess_from_path("Breaking Bad/S01/E01"),
            Guess {
                title: Some("Breaking Bad".into()),
                season: Some(1),
                episode: Some(1),
                year: None
            }
        );
        assert_eq!(
            guess_from_path("Dune.2021.1080p.BluRay"),
            Guess {
                title: Some("Dune".into()),
                season: None,
                episode: None,
                year: Some(2021)
            }
        );
    }

    #[test]
    fn finds_the_series_folder() {
        let two = ["Breaking Bad/S01/E01", "Breaking Bad/S01/E02"];
        assert_eq!(
            series_folder(two.into_iter()).as_deref(),
            Some("Breaking Bad")
        );
        // One episode must resolve to the series folder too, not to its season folder.
        let one = ["Breaking Bad/S01/E01"];
        assert_eq!(
            series_folder(one.into_iter()).as_deref(),
            Some("Breaking Bad")
        );
        let flat = ["Breaking Bad/E01"];
        assert_eq!(
            series_folder(flat.into_iter()).as_deref(),
            Some("Breaking Bad")
        );
        assert_eq!(series_folder(std::iter::empty()), None);
    }

    #[test]
    fn scan_groups_episodes_into_a_series() {
        let root = std::env::temp_dir().join(format!("subplayer-scan-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&root);
        let posters = root.join("posters");
        let movie = root.join("media/Dune.2021.1080p.BluRay");
        let ep1 = root.join("media/Breaking Bad/S01/E01");
        let ep2 = root.join("media/Breaking Bad/S01/E02");
        for dir in [&movie, &ep1, &ep2] {
            std::fs::create_dir_all(dir).unwrap();
            std::fs::write(dir.join("video.mp4"), b"").unwrap();
        }
        std::fs::write(movie.join("subs.vtt"), b"").unwrap();
        std::fs::write(movie.join("poster.jpg"), b"x").unwrap();
        std::fs::write(
            ep2.join("meta.json"),
            r#"{"title":"Breaking Bad","duration":2880}"#,
        )
        .unwrap();

        let lib = scan(&root.join("media"), &posters);
        assert_eq!(
            lib.movies.len(),
            1,
            "folder without meta.json must still appear"
        );
        assert_eq!(lib.movies[0].title, "Dune");
        assert_eq!(lib.movies[0].year, Some(2021));
        assert_eq!(
            lib.movies[0].poster.as_deref(),
            Some("/media/Dune.2021.1080p.BluRay/poster.jpg")
        );

        assert_eq!(lib.series.len(), 1, "episodes belong to one series card");
        let series = &lib.series[0];
        assert_eq!(series.title, "Breaking Bad");
        assert_eq!(series.id, "breaking-bad");
        assert_eq!(series.episodes.len(), 2);
        assert_eq!(series.seasons, 1);
        assert_eq!(series.duration, Some(2880.0));
        assert_eq!(
            (series.episodes[0].season, series.episodes[0].episode),
            (Some(1), Some(1))
        );
        let _ = std::fs::remove_dir_all(&root);
    }
}
