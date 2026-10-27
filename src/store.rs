use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

/// Global defaults. Subtitle settings are edited in the player, not on the settings
/// screen — the screen only keeps what has no better home.
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(default, rename_all = "camelCase")]
pub struct Settings {
    pub mode: String,
    pub size: u32,
    /// Subtitle block centre, in percent of the video box. Free placement, not a preset row.
    pub pos_x: f64,
    pub pos_y: f64,
    pub shift: f64,
    pub rate: f64,
    pub show_prev: bool,
    pub sort: String,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            mode: "both".into(),
            size: 26,
            pos_x: 50.0,
            pos_y: 86.0,
            shift: 0.0,
            rate: 1.0,
            show_prev: false,
            sort: "recent".into(),
        }
    }
}

impl Settings {
    /// Clamp whatever the client sent into a range the UI can actually render.
    pub fn sanitized(mut self) -> Self {
        if !["both", "orig", "trans", "off"].contains(&self.mode.as_str()) {
            self.mode = "both".into();
        }
        if !["recent", "alpha", "added"].contains(&self.sort.as_str()) {
            self.sort = "recent".into();
        }
        self.size = self.size.clamp(12, 80);
        self.pos_x = self.pos_x.clamp(0.0, 100.0);
        self.pos_y = self.pos_y.clamp(0.0, 100.0);
        self.shift = self.shift.clamp(-60.0, 60.0);
        self.rate = self.rate.clamp(0.25, 4.0);
        self
    }
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(default, rename_all = "camelCase")]
pub struct Progress {
    pub t: f64,
    pub dur: f64,
    /// Per-item timing shift; `None` falls back to `Settings::shift`.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub shift: Option<f64>,
    /// Unix seconds of the last save — drives "continue watching" and the "recent" sort.
    pub updated: u64,
}

pub struct Store {
    dir: PathBuf,
    write_lock: Mutex<()>,
}

impl Store {
    pub fn new(dir: impl Into<PathBuf>) -> Self {
        Self { dir: dir.into(), write_lock: Mutex::new(()) }
    }

    fn settings_path(&self) -> PathBuf {
        self.dir.join("settings.json")
    }

    fn progress_path(&self) -> PathBuf {
        self.dir.join("progress.json")
    }

    /// Read from disk every time: the files are tiny and hand-editing them should just work.
    pub fn settings(&self) -> Settings {
        read_json::<Settings>(&self.settings_path()).unwrap_or_default().sanitized()
    }

    pub fn save_settings(&self, settings: Settings) -> Settings {
        let settings = settings.sanitized();
        self.write(&self.settings_path(), &settings);
        settings
    }

    pub fn progress(&self) -> HashMap<String, Progress> {
        read_json::<HashMap<String, Progress>>(&self.progress_path()).unwrap_or_default()
    }

    pub fn save_progress(&self, id: &str, mut entry: Progress) {
        if id.is_empty() || id.len() > 512 {
            return;
        }
        entry.t = entry.t.max(0.0);
        entry.dur = entry.dur.max(0.0);
        entry.shift = entry.shift.map(|s| s.clamp(-60.0, 60.0));
        entry.updated = now();
        let mut all = self.progress();
        all.insert(id.to_string(), entry);
        self.write(&self.progress_path(), &all);
    }

    fn write<T: Serialize>(&self, path: &Path, value: &T) {
        let _guard = self.write_lock.lock().unwrap();
        let Ok(json) = serde_json::to_vec_pretty(value) else { return };
        let tmp = path.with_extension("json.tmp");
        // tmp + rename so a crash mid-write can't truncate the real file.
        if std::fs::write(&tmp, json).is_ok() {
            let _ = std::fs::rename(&tmp, path);
        }
    }
}

fn now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

fn read_json<T: for<'de> Deserialize<'de>>(path: &Path) -> Option<T> {
    std::fs::read_to_string(path).ok().and_then(|s| serde_json::from_str(&s).ok())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn clamps_hostile_settings() {
        let s = Settings {
            mode: "evil".into(),
            sort: "whatever".into(),
            size: 9999,
            pos_x: -40.0,
            pos_y: 500.0,
            shift: 900.0,
            rate: 0.0,
            show_prev: true,
        }
        .sanitized();
        assert_eq!(s.mode, "both");
        assert_eq!(s.sort, "recent");
        assert_eq!(s.size, 80);
        assert_eq!(s.pos_x, 0.0);
        assert_eq!(s.pos_y, 100.0);
        assert_eq!(s.shift, 60.0);
        assert_eq!(s.rate, 0.25);
    }

    #[test]
    fn defaults_place_subtitles_low_and_centred() {
        let d = Settings::default();
        assert_eq!((d.pos_x, d.pos_y), (50.0, 86.0));
    }

    #[test]
    fn settings_and_progress_roundtrip() {
        let dir = std::env::temp_dir().join(format!("subplayer-store-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let store = Store::new(&dir);
        assert_eq!(store.settings().mode, "both", "missing file yields defaults");

        store.save_settings(Settings { mode: "orig".into(), ..Default::default() });
        assert_eq!(store.settings().mode, "orig");

        store.save_progress("Breaking Bad/S01/E01", Progress { t: 12.5, dur: 100.0, shift: Some(-1.5), updated: 0 });
        store.save_progress("Dune", Progress { t: 3.0, dur: 50.0, shift: None, updated: 0 });
        let all = store.progress();
        assert_eq!(all.len(), 2);
        assert_eq!(all["Breaking Bad/S01/E01"].shift, Some(-1.5));
        assert!(all["Dune"].updated > 0, "the server stamps the save time");

        // A corrupt file must not take the server down.
        std::fs::write(dir.join("progress.json"), b"{not json").unwrap();
        assert!(store.progress().is_empty());
        let _ = std::fs::remove_dir_all(&dir);
    }
}
