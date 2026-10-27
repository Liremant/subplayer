import { useEffect, type RefObject } from 'react';

/**
 * Keeps the active cue in the vertical middle of its list.
 *
 * `scrollIntoView` is wrong twice over here: it also scrolls the document, and it only
 * pulls the cue to the nearest edge — which leaves the line you are reading at the very
 * bottom of the column, the furthest place from where your eyes already are.
 */
export function useCenterActive(
  listRef: RefObject<HTMLElement | null>,
  activeRef: RefObject<HTMLElement | null>,
  activeIndex: number,
  extra?: unknown,
) {
  useEffect(() => {
    const list = listRef.current;
    const active = activeRef.current;
    if (!list || !active) return;
    const box = list.getBoundingClientRect();
    const cue = active.getBoundingClientRect();
    const offset = cue.top - box.top + list.scrollTop;
    const target = offset - (box.height - cue.height) / 2;
    // Jump rather than animate: this fires on every cue change, and a scrolling column
    // during playback is more distracting than a cut.
    list.scrollTop = Math.max(0, Math.min(target, list.scrollHeight - box.height));
  }, [listRef, activeRef, activeIndex, extra]);
}
