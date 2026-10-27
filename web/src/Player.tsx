import { Video, VideoPlayer, VideoSkin } from '@videojs/react/video';
import '@videojs/react/video/skin.css';
import { useEffect, useRef, useState } from 'react';
import {
  api,
  defaultSettings,
  label,
  mediaUrl,
  MODE_LABELS,
  type Item,
  type Mode,
  type Settings,
} from './api';
import { FloatingPanel } from './FloatingPanel';
import { navigate } from './router';
import { PlayerKeys } from './PlayerKeys';
import { StageShell } from './StageShell';
import { PlayerSettings } from './PlayerSettings';
import { PosterPicker } from './PosterPicker';
import { SubtitleList } from './SubtitleList';
import { SubtitleOverlay } from './SubtitleOverlay';
import { findCueIndex, parseSubs, type Cue } from './subtitle';

const MODES: Mode[] = ['both', 'orig', 'trans', 'off'];

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** Tracks the active cue with rAF: `timeupdate` fires ~4x/sec, which is visible. */
function useActiveCue(
  videoRef: React.RefObject<HTMLVideoElement | null>,
  cues: Cue[],
  shift: number,
) {
  const [index, setIndex] = useState(-1);
  useEffect(() => {
    let raf = 0;
    let last = -2;
    const tick = () => {
      const el = videoRef.current;
      if (el && cues.length > 0) {
        const next = findCueIndex(cues, el.currentTime - shift);
        if (next !== last) {
          last = next;
          setIndex(next);
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [videoRef, cues, shift]);
  return index;
}

/**
 * The cue the panels highlight: the exact cue, or the last one while the video sits in a
 * gap between cues. Without this the highlight blinks off during every pause in dialogue,
 * which reads as a glitch rather than as silence.
 */
function useHeldCue(index: number): number {
  const [held, setHeld] = useState(-1);
  useEffect(() => {
    if (index >= 0) setHeld(index);
  }, [index]);
  return held;
}

export function Player({ itemId }: { itemId: string }) {
  const [item, setItem] = useState<Item | null>(null);
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [cues, setCues] = useState<Cue[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>('both');
  const [shift, setShift] = useState(0);
  const [query, setQuery] = useState('');
  const [posterNote, setPosterNote] = useState('');
  const [movable, setMovable] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const shiftRef = useRef(shift);

  useEffect(() => {
    shiftRef.current = shift;
  }, [shift]);

  useEffect(() => {
    Promise.all([api.library(), api.settings()])
      .then(([library, loaded]) => {
        const found =
          library.movies.find((i) => i.id === itemId) ??
          library.series.flatMap((s) => s.episodes).find((i) => i.id === itemId);
        if (!found) {
          setError('Материал не найден — возможно, папку переименовали.');
          return;
        }
        setItem(found);
        setSettings(loaded);
        setMode(loaded.mode);
        // A per-item shift is what actually fits one release; the global one is the default.
        setShift(found.progress?.shift ?? loaded.shift);
      })
      .catch((e: unknown) => setError(String(e)));
  }, [itemId]);

  useEffect(() => {
    if (!item?.subs) return;
    let cancelled = false;
    fetch(mediaUrl(item.subs))
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error(`субтитры: ${r.status}`))))
      .then((text) => !cancelled && setCues(parseSubs(text)))
      .catch((e: unknown) => !cancelled && setError(String(e)));
    return () => {
      cancelled = true;
    };
  }, [item?.subs]);

  // Save position every 5s while playing, on pause, and on the way out.
  useEffect(() => {
    const el = videoRef.current;
    if (!el || !item) return;
    const save = () => {
      if (el.duration > 0) {
        api.saveProgress(item.id, el.currentTime, el.duration, shiftRef.current).catch(() => {});
      }
    };
    const timer = window.setInterval(() => {
      if (!el.paused) save();
    }, 5000);
    el.addEventListener('pause', save);
    window.addEventListener('pagehide', save);
    return () => {
      window.clearInterval(timer);
      el.removeEventListener('pause', save);
      window.removeEventListener('pagehide', save);
      save();
    };
  }, [item]);

  /** Player settings are global defaults; shift stays per release, saved with progress. */
  const patchSettings = (change: Partial<Settings>) => {
    const next = { ...settings, ...change };
    setSettings(next);
    api.saveSettings(next).catch(() => {});
    if (change.rate && videoRef.current) videoRef.current.playbackRate = change.rate;
  };

  /** Dragging the overlay writes positions on every pointer move — save on release. */
  const moveOverlay = (posX: number, posY: number) => setSettings((s) => ({ ...s, posX, posY }));
  const commitSettings = () => api.saveSettings(settings).catch(() => {});

  const exactIndex = useActiveCue(videoRef, cues, shift);
  // Overlay shows only the cue actually on screen; panels keep the last one highlighted.
  const activeIndex = useHeldCue(exactIndex);
  const seek = (seconds: number) => {
    const el = videoRef.current;
    if (el) el.currentTime = seconds;
  };

  if (error) {
    return (
      <main className="screen">
        <p className="error">{error}</p>
        <p className="spaced">
          <button className="link" onClick={() => navigate('/')}>
            ← в каталог
          </button>
        </p>
      </main>
    );
  }
  if (!item) return <main className="screen">Загрузка…</main>;

  return (
    <main className="player">
      <header className="topbar">
        <button className="link" onClick={() => navigate('/')}>
          ← каталог
        </button>
        <h1 className="topbar__title">{`${item.title} ${label(item)}`.trim()}</h1>
        <span className="topbar__hint">Space пауза · ←→ 5с · f фуллскрин · c режим · g двигать · [ ] сдвиг</span>
      </header>

      <div className="player__body">
        <div className="player__main">
          <VideoPlayer>
            <StageShell>
              <VideoSkin className="stage">
              <Video
                ref={videoRef}
                src={mediaUrl(item.video)}
                playsInline
                preload="metadata"
                onLoadedMetadata={(e) => {
                  const el = e.currentTarget;
                  el.playbackRate = settings.rate;
                  const saved = item.progress;
                  if (saved && saved.t > 5 && (saved.dur === 0 || saved.t < saved.dur - 10)) {
                    el.currentTime = saved.t;
                  }
                }}
              />
              <SubtitleOverlay
                cue={cues[exactIndex] ?? null}
                prevCue={exactIndex > 0 ? cues[exactIndex - 1] : null}
                mode={mode}
                size={settings.size}
                posX={settings.posX}
                posY={settings.posY}
                showPrev={settings.showPrev}
                movable={movable}
                onMove={moveOverlay}
                onMoveEnd={commitSettings}
              />
              <PlayerKeys
                onShift={(delta) => setShift((s) => round1(s + delta))}
                onCycleMode={() => setMode((m) => MODES[(MODES.indexOf(m) + 1) % MODES.length])}
                onToggleMove={() => setMovable((v) => !v)}
              />
              </VideoSkin>
              <FloatingPanel cues={cues} activeIndex={activeIndex} shift={shift} onSeek={seek} />
            </StageShell>
          </VideoPlayer>

          <div className="shiftbar">
            <span className="shiftbar__label">Сдвиг субтитров</span>
            <button
              className="btn"
              aria-label="Сдвинуть субтитры на 0,5 секунды раньше"
              onClick={() => setShift((s) => round1(s - 0.5))}
            >
              −0.5
            </button>
            <output className={shift === 0 ? 'shiftbar__value' : 'shiftbar__value shiftbar__value--set'}>
              {shift > 0 ? '+' : ''}
              {shift.toFixed(1)} с
            </output>
            <button
              className="btn"
              aria-label="Сдвинуть субтитры на 0,5 секунды позже"
              onClick={() => setShift((s) => round1(s + 0.5))}
            >
              +0.5
            </button>
            <button className="btn" onClick={() => setShift(0)} disabled={shift === 0}>
              сброс
            </button>
            <span className="shiftbar__sep" aria-hidden="true" />
            <span className="shiftbar__mode">режим: {MODE_LABELS[mode]}</span>
            {cues.length === 0 && <span className="shiftbar__warn">субтитры не загружены</span>}
            <span className="shiftbar__end">
              {/* An episode's cover belongs to its series card, so only movies get a picker here. */}
              {item.kind === 'movie' && (
                <PosterPicker
                  kind="movie"
                  id={item.id}
                  query={item.title}
                  onPicked={() => setPosterNote('обложка обновлена')}
                />
              )}
              {posterNote && <span className="shiftbar__warn">{posterNote}</span>}
              <PlayerSettings
                settings={settings}
                mode={mode}
                movable={movable}
                onChange={patchSettings}
                onMode={(m) => {
                  setMode(m);
                  patchSettings({ mode: m });
                }}
                onMovable={setMovable}
              />
            </span>
          </div>
        </div>

        <SubtitleList
          cues={cues}
          activeIndex={activeIndex}
          query={query}
          shift={shift}
          onQueryChange={setQuery}
          onSeek={seek}
        />
      </div>
    </main>
  );
}
