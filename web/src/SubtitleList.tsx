import { useMemo, useRef } from 'react';
import type { Cue } from './subtitle';
import { formatTime, searchCues } from './subtitle';
import { useCenterActive } from './useCenterActive';

interface Props {
  cues: Cue[];
  activeIndex: number;
  query: string;
  /** Timing shift in seconds: a cue is on screen at `cue.start + shift`. */
  shift: number;
  onQueryChange: (value: string) => void;
  onSeek: (seconds: number) => void;
}

/** Where the cue actually appears once the shift is applied, never before the start. */
function cueAt(cue: Cue, shift: number): number {
  return Math.max(cue.start + shift, 0);
}

function highlight(text: string, query: string) {
  const q = query.trim();
  if (!q) return text;
  const at = text.toLowerCase().indexOf(q.toLowerCase());
  if (at < 0) return text;
  return (
    <>
      {text.slice(0, at)}
      <mark>{text.slice(at, at + q.length)}</mark>
      {text.slice(at + q.length)}
    </>
  );
}

export function SubtitleList({ cues, activeIndex, query, shift, onQueryChange, onSeek }: Props) {
  const hits = useMemo(() => searchCues(cues, query), [cues, query]);
  const visible = query.trim() ? hits : cues.map((_, i) => i);
  const activeRef = useRef<HTMLButtonElement | null>(null);
  const listRef = useRef<HTMLOListElement | null>(null);

  useCenterActive(listRef, activeRef, activeIndex, query);

  return (
    <aside className="panel" aria-label="Субтитры">
      <div className="panel__search">
        <input
          type="search"
          value={query}
          placeholder="Поиск по субтитрам"
          aria-label="Поиск по субтитрам"
          onChange={(e) => onQueryChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && hits.length > 0) onSeek(cueAt(cues[hits[0]], shift));
            if (e.key === 'Escape') onQueryChange('');
          }}
        />
        {query.trim() !== '' && (
          <span className="panel__count" role="status">
            {hits.length > 0 ? `${hits.length} совп.` : 'нет'}
          </span>
        )}
      </div>
      <ol className="panel__list" ref={listRef}>
        {visible.map((i) => {
          const cue = cues[i];
          return (
            <li key={i}>
              <button
                ref={i === activeIndex ? activeRef : null}
                className={i === activeIndex ? 'cue cue--active' : 'cue'}
                onClick={() => onSeek(cueAt(cue, shift))}
              >
                <span className="cue__time">{formatTime(cueAt(cue, shift))}</span>
                <span className="cue__text">
                  {cue.orig && <span className="cue__orig">{highlight(cue.orig, query)}</span>}
                  {(cue.trans || !cue.orig) && (
                    <span className="cue__trans">{highlight(cue.trans, query)}</span>
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </aside>
  );
}
