import { usePlayer } from '@videojs/react/video';
import { useEffect, useRef } from 'react';

interface Props {
  onShift: (delta: number) => void;
  onCycleMode: () => void;
  onToggleMove: () => void;
}

const RATES = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

/** A focused control owns its keys — Space must still press the button you tabbed to. */
function ownsKeys(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || !el.tagName) return false;
  if (el.isContentEditable) return true;
  if (['INPUT', 'TEXTAREA', 'SELECT', 'OPTION'].includes(el.tagName)) return true;
  return el.closest('button, a, summary, [role="button"], [role="menuitem"], [role="option"], [role="slider"]') !== null;
}

/**
 * All player keys, matched by `event.code` instead of `event.key`.
 *
 * The packaged skin registers its own hotkeys by `key` ("f", "m", "c"…), so on a Russian
 * layout it hears "а", "ь", "с" and nothing works. This listener runs in the capture phase
 * and stops the event, so the skin never sees a key we handle: one implementation, and it
 * behaves the same on any layout.
 */
export function PlayerKeys({ onShift, onCycleMode, onToggleMove }: Props) {
  const store = usePlayer();
  const paused = usePlayer((s) => s.paused);
  const muted = usePlayer((s) => s.muted);
  const volume = usePlayer((s) => s.volume);
  const isFullscreen = usePlayer((s) => s.isFullscreen);
  const isPip = usePlayer((s) => s.isPictureInPicture);
  const duration = usePlayer((s) => s.duration);
  const currentTime = usePlayer((s) => s.currentTime);
  const playbackRate = usePlayer((s) => s.playbackRate);

  // The listener is registered once; a ref carries the current state into it.
  const latest = useRef({ paused, muted, volume, isFullscreen, isPip, duration, currentTime, playbackRate, store });
  latest.current = { paused, muted, volume, isFullscreen, isPip, duration, currentTime, playbackRate, store };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (ownsKeys(e.target)) return;

      const s = latest.current;
      const seekBy = (delta: number) => {
        const max = s.duration > 0 ? s.duration : Infinity;
        s.store.seek(Math.min(Math.max(s.currentTime + delta, 0), max));
      };
      const setVolume = (delta: number) => {
        const next = Math.min(Math.max(s.volume + delta, 0), 1);
        s.store.setVolume(next);
        if (next > 0 && s.muted) s.store.setMuted(false);
      };
      const stepRate = (dir: 1 | -1) => {
        const at = RATES.indexOf(s.playbackRate);
        const next = RATES[Math.min(Math.max((at < 0 ? 2 : at) + dir, 0), RATES.length - 1)];
        s.store.setPlaybackRate(next);
      };

      switch (e.code) {
        case 'Space':
        case 'KeyK':
          if (s.paused) void s.store.play();
          else s.store.pause();
          break;
        case 'KeyM':
          s.store.setMuted(!s.muted);
          break;
        case 'KeyF':
          void (s.isFullscreen ? s.store.exitFullscreen() : s.store.requestFullscreen());
          break;
        case 'KeyI':
          void (s.isPip ? s.store.exitPictureInPicture() : s.store.requestPictureInPicture());
          break;
        case 'KeyC':
          onCycleMode();
          break;
        case 'KeyG':
          onToggleMove();
          break;
        case 'KeyJ':
          seekBy(-10);
          break;
        case 'KeyL':
          seekBy(10);
          break;
        case 'ArrowLeft':
          seekBy(-5);
          break;
        case 'ArrowRight':
          seekBy(5);
          break;
        case 'ArrowUp':
          setVolume(0.05);
          break;
        case 'ArrowDown':
          setVolume(-0.05);
          break;
        case 'BracketLeft':
          onShift(-0.5);
          break;
        case 'BracketRight':
          onShift(0.5);
          break;
        case 'Home':
          s.store.seek(0);
          break;
        case 'End':
          if (s.duration > 0) s.store.seek(s.duration);
          break;
        case 'Comma':
          stepRate(-1);
          break;
        case 'Period':
          stepRate(1);
          break;
        default: {
          const digit = /^Digit([0-9])$/.exec(e.code);
          if (!digit) return;
          if (s.duration > 0) s.store.seek((s.duration * Number(digit[1])) / 10);
        }
      }
      e.preventDefault();
      e.stopPropagation();
    };

    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [onShift, onCycleMode, onToggleMove]);

  return null;
}
