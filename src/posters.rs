use serde::Serialize;
use std::path::{Path, PathBuf};

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Candidate {
    pub provider: &'static str,
    pub title: String,
    pub year: Option<u32>,
    /// Full-size image to download.
    pub poster: String,
}

pub async fn search(http: &reqwest::Client, kind: &str, query: &str) -> Vec<Candidate> {
    if query.trim().is_empty() {
        return Vec::new();
    }
    if kind == "series" {
        tvmaze(http, query).await
    } else {
        itunes(http, query).await
    }
}

async fn tvmaze(http: &reqwest::Client, query: &str) -> Vec<Candidate> {
    let url = format!("https://api.tvmaze.com/search/shows?q={}", encode(query));
    let Ok(res) = http.get(url).send().await else {
        return Vec::new();
    };
    let Ok(rows) = res.json::<Vec<serde_json::Value>>().await else {
        return Vec::new();
    };
    rows.into_iter()
        .filter_map(|row| {
            let show = row.get("show")?;
            let poster = show.pointer("/image/original")?.as_str()?.to_string();
            Some(Candidate {
                provider: "tvmaze",
                title: show.get("name")?.as_str()?.to_string(),
                year: show
                    .get("premiered")
                    .and_then(|p| p.as_str())
                    .and_then(|p| p.get(..4))
                    .and_then(|y| y.parse().ok()),
                poster,
            })
        })
        .take(8)
        .collect()
}

async fn itunes(http: &reqwest::Client, query: &str) -> Vec<Candidate> {
    // No `entity`/`media` filter: those currently return nothing, so filter client-side.
    let url = format!(
        "https://itunes.apple.com/search?term={}&limit=25",
        encode(query)
    );
    let Ok(res) = http.get(url).send().await else {
        return Vec::new();
    };
    let Ok(body) = res.json::<serde_json::Value>().await else {
        return Vec::new();
    };
    let Some(rows) = body.get("results").and_then(|r| r.as_array()) else {
        return Vec::new();
    };
    rows.iter()
        .filter(|row| row.get("kind").and_then(|k| k.as_str()) == Some("feature-movie"))
        .filter_map(|row| {
            let small = row.get("artworkUrl100")?.as_str()?;
            Some(Candidate {
                provider: "itunes",
                title: row.get("trackName")?.as_str()?.to_string(),
                year: row
                    .get("releaseDate")
                    .and_then(|d| d.as_str())
                    .and_then(|d| d.get(..4))
                    .and_then(|y| y.parse().ok()),
                // iTunes encodes the size in the path; ask for a usable poster instead of a 100px thumb.
                poster: small.replace("100x100bb", "600x600bb"),
            })
        })
        .take(8)
        .collect()
}

/// Downloads a poster into the data dir. Returns the file name, or `None` if the
/// response is not an image (a redirected HTML error page must not become a poster).
pub async fn download(http: &reqwest::Client, dir: &Path, slug: &str, url: &str) -> Option<String> {
    let res = http.get(url).send().await.ok()?;
    if !res.status().is_success() {
        return None;
    }
    let mime = res
        .headers()
        .get("content-type")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
        .to_string();
    let ext = mime_ext(&mime)?;
    let bytes = res.bytes().await.ok()?;
    if bytes.len() < 1024 || bytes.len() > 8 * 1024 * 1024 {
        return None;
    }
    std::fs::create_dir_all(dir).ok()?;
    let name = format!("{slug}.{ext}");
    std::fs::write(dir.join(&name), bytes).ok()?;
    Some(name)
}

/// Finds an existing poster for `slug` in the poster dir.
pub fn existing(dir: &Path, slug: &str) -> Option<String> {
    ["jpg", "jpeg", "png", "webp", "avif"]
        .iter()
        .map(|ext| dir.join(format!("{slug}.{ext}")))
        .find(|p| p.is_file())
        .and_then(|p| p.file_name().map(|n| n.to_string_lossy().into_owned()))
}

/// `Breaking Bad` → `breaking-bad`, `🎬 Фильм` → `film`. Non-ASCII is dropped, so the
/// slug is stable as a file name; a title that leaves nothing falls back to `title`.
pub fn slug(text: &str) -> String {
    let mut out = String::new();
    for ch in text.chars() {
        if ch.is_ascii_alphanumeric() {
            out.push(ch.to_ascii_lowercase());
        } else if !out.ends_with('-') {
            out.push('-');
        }
    }
    let trimmed = out.trim_matches('-').to_string();
    if trimmed.is_empty() {
        "title".to_string()
    } else {
        trimmed
    }
}

fn mime_ext(mime: &str) -> Option<&'static str> {
    match mime.split(';').next().unwrap_or("").trim() {
        "image/png" => Some("png"),
        "image/webp" => Some("webp"),
        "image/jpeg" | "image/jpg" => Some("jpg"),
        _ => None,
    }
}

fn encode(text: &str) -> String {
    let mut out = String::new();
    for byte in text.as_bytes() {
        match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(*byte as char)
            }
            b' ' => out.push('+'),
            _ => out.push_str(&format!("%{byte:02X}")),
        }
    }
    out
}

/// Downloads land in `<data>/posters`; the SPA reads them from `/posters/<file>`.
pub fn dir(data: &Path) -> PathBuf {
    data.join("posters")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn slugifies_titles() {
        assert_eq!(slug("Breaking Bad"), "breaking-bad");
        assert_eq!(slug("Dune: Part Two"), "dune-part-two");
        assert_eq!(slug("🎬"), "title");
        assert_eq!(slug("  --x--  "), "x");
    }

    #[test]
    fn encodes_queries() {
        assert_eq!(encode("breaking bad"), "breaking+bad");
        assert_eq!(encode("дюна"), "%D0%B4%D1%8E%D0%BD%D0%B0");
    }

    #[test]
    fn rejects_non_images() {
        // The extension is derived from content-type, not from the URL.
        assert_eq!(mime_ext("image/jpeg; charset=utf-8"), Some("jpg"));
        assert_eq!(mime_ext("image/png"), Some("png"));
        assert_eq!(mime_ext("text/html"), None);
        assert_eq!(mime_ext(""), None);
    }
}
