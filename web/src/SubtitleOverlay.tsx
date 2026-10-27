import { useRef, type CSSProperties, type PointerEvent } from 'react';
import type { Cue } from './subtitle';
import type { Mode } from './api';

interface Props {
  cue: Cue | null;
  prevCue: Cue | null;
  mode: Mode;
  size: number;
  /** Centre of the block, percent of the video box. */
  posX: number;
  posY: number;
  showPrev: boolean;
  /** When true the block is grabbable and shows its bounds. */
  movable: boolean;
  onMove: (posX: number, posY: number) => void;
  onMoveEnd: () => void;
}

const clamp = (n: number) => Math.min(Math.max(n, 0), 100);

/** Rendered inside the player skin, above the video and below the controls. */
export function SubtitleOverlay({
  cue,
  prevCue,
  mode,
  size,
  posX,
  posY,
  showPrev,
  movable,
  onMove,
  onMoveEnd,
}: Props) {
  const style = {
    '--sub-size': `${size}px`,
    '--sub-x': `${posX}%`,
    '--sub-y': `${posY}%`,
  } as CSSProperties;

  const drag = useRef<{ pointer: number; x: number; y: number; posX: number; posY: number; box: DOMRect } | null>(null);

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (!movable) return;
    const box = e.currentTarget.parentElement?.getBoundingClientRect();
    if (!box) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { pointer: e.pointerId, x: e.clientX, y: e.clientY, posX, posY, box };
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.pointer !== e.pointerId) return;
    // Percent of the video box, so a position survives resizing and fullscreen.
    onMove(
      clamp(d.posX + ((e.clientX - d.x) / d.box.width) * 100),
      clamp(d.posY + ((e.clientY - d.y) / d.box.height) * 100),
    );
  };

  const endDrag = (e: PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    drag.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    onMoveEnd();
  };

  // A single-language file has no bold line. It must still show in every mode but "off",
  // otherwise "перевод" would render an empty overlay for a Russian-only track.
  const single = cue && !cue.orig ? cue.trans : '';
  const orig = cue?.orig ?? '';
  const trans = cue?.orig ? cue.trans : '';

  return (
    <div
      className={movable ? 'overlay overlay--movable' : 'overlay'}
      style={style}
      aria-hidden={movable ? undefined : 'true'}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    >
      {showPrev && prevCue && mode !== 'off' && (
        <div className="overlay__prev">{prevCue.orig || prevCue.trans}</div>
      )}
      {cue && mode !== 'off' && (
        <>
          {single && <div className="overlay__orig">{single}</div>}
          {!single && (mode === 'both' || mode === 'orig') && orig && (
            <div className="overlay__orig">{orig}</div>
          )}
          {!single && (mode === 'both' || mode === 'trans') && trans && (
            <div className="overlay__trans">{trans}</div>
          )}
        </>
      )}
    </div>
  );
}
