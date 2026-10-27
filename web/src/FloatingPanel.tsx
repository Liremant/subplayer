import { usePlayer } from '@videojs/react/video';
import { useRef } from 'react';
import { formatTime, type Cue } from './subtitle';
import { useCenterActive } from './useCenterActive';

interface Props {
  cues: Cue[];
  activeIndex: number;
  shift: number;
  onSeek: (seconds: number) => void;
}

function cueAt(cue: Cue, shift: number): number {
  return Math.max(cue.start + shift, 0);
}

/**
 * Dialogue panel beside the video. It is a sibling of the skin inside the fullscreen
 * container, not an overlay: covering the picture made the subtitles hard to read.
 */
export function FloatingPanel({ cues, activeIndex, shift, onSeek }: Props) {
  const isFullscreen = usePlayer((s) => s.isFullscreen);
  const listRef = useRef<HTMLOListElement | null>(null);
  const activeRef = useRef<HTMLButtonElement | null>(null);

  useCenterActive(listRef, activeRef, activeIndex, isFullscreen);

  if (!isFullscreen || cues.length === 0) return null;

  return (
    <div className="fsbar">
      <ol className="fsbar__list" ref={listRef}>
        {cues.map((cue, i) => (
          <li key={i}>
            <button
              ref={i === activeIndex ? activeRef : null}
              className={i === activeIndex ? 'fsbar__cue fsbar__cue--active' : 'fsbar__cue'}
              onClick={() => onSeek(cueAt(cue, shift))}
            >
              <span className="fsbar__time">{formatTime(cueAt(cue, shift))}</span>
              <span className="fsbar__text">
                {(cue.orig || cue.trans) && <span className="fsbar__orig">{cue.orig || cue.trans}</span>}
                {cue.orig && cue.trans && <span className="fsbar__trans">{cue.trans}</span>}
              </span>
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}
