use std::fs::File;
use std::io::{Read, Seek, SeekFrom};
use std::path::Path;

/// Duration in seconds from the mp4 `moov/mvhd` box, so a folder with just a video
/// still shows a length in the catalog.
///
/// shortcut: no memoisation — one scan re-reads each file's header/footer, fine for a
/// personal library of tens of files; add an mtime-keyed cache past a few hundred.
pub fn duration(path: &Path) -> Option<f64> {
    let mut file = File::open(path).ok()?;
    let len = file.metadata().ok()?.len();
    for chunk in [CHUNK, -CHUNK] {
        let start = if chunk < 0 {
            len.saturating_sub(chunk.unsigned_abs())
        } else {
            0
        };
        file.seek(SeekFrom::Start(start)).ok()?;
        let mut buf = vec![0u8; (len - start).min(chunk.unsigned_abs()) as usize];
        file.read_exact(&mut buf).ok()?;
        if let Some(seconds) = find_mvhd(&buf) {
            return Some(seconds);
        }
    }
    None
}

/// `moov` may sit at the front (faststart) or the back; 256 KiB either way covers both.
const CHUNK: i64 = 256 * 1024;

fn find_mvhd(buf: &[u8]) -> Option<f64> {
    let at = buf.windows(4).position(|w| w == b"mvhd")?;
    // `mvhd` payload: version(1) flags(3) …
    let p = at + 4;
    match *buf.get(p)? {
        0 => {
            let timescale = be32(buf, p + 12)?;
            let ticks = be32(buf, p + 16)?;
            ratio(timescale, ticks as f64)
        }
        1 => {
            let timescale = be32(buf, p + 20)?;
            let ticks = be64(buf, p + 24)?;
            ratio(timescale, ticks as f64)
        }
        _ => None,
    }
}

fn ratio(timescale: u32, ticks: f64) -> Option<f64> {
    // Fragmented files report 0 here; treat that as "unknown", not "zero-length".
    if timescale == 0 || ticks <= 0.0 {
        return None;
    }
    Some(ticks / timescale as f64)
}

fn be32(buf: &[u8], at: usize) -> Option<u32> {
    buf.get(at..at + 4)
        .map(|b| u32::from_be_bytes([b[0], b[1], b[2], b[3]]))
}

fn be64(buf: &[u8], at: usize) -> Option<u64> {
    buf.get(at..at + 8)
        .and_then(|b| b.try_into().ok())
        .map(u64::from_be_bytes)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn mvhd_v0(timescale: u32, ticks: u32) -> Vec<u8> {
        let mut v = b"mvhd".to_vec();
        v.extend([0, 0, 0, 0]); // version + flags
        v.extend([0; 8]); // created + modified
        v.extend(timescale.to_be_bytes());
        v.extend(ticks.to_be_bytes());
        v
    }

    #[test]
    fn reads_version0_duration() {
        let buf = mvhd_v0(1000, 2_830_000);
        assert_eq!(find_mvhd(&buf), Some(2830.0));
    }

    #[test]
    fn rejects_fragmented_and_garbage() {
        assert_eq!(find_mvhd(&mvhd_v0(1000, 0)), None, "0 ticks means unknown");
        assert_eq!(find_mvhd(&mvhd_v0(0, 500)), None, "no timescale");
        assert_eq!(find_mvhd(b"not an mp4 at all"), None);
        assert_eq!(find_mvhd(b"mvhd"), None, "truncated box");
    }

    #[test]
    fn reads_duration_from_a_real_file() {
        let fixture = Path::new(env!("CARGO_MANIFEST_DIR")).join("media/Dune (2021)/video.mp4");
        if !fixture.exists() {
            return;
        }
        let secs = duration(&fixture).expect("duration");
        assert!((secs - 30.0).abs() < 0.5, "got {secs}");
    }
}
