import { useEffect, useState } from 'react';
import { api, type Candidate } from './api';

interface Props {
  kind: 'movie' | 'series';
  /** Series slug or movie folder id. */
  id: string;
  /** Default query — the title as the library sees it. */
  query: string;
  onPicked: (poster: string) => void;
}

/**
 * Search is done by the Rust side against two free, key-less sources (TVmaze for
 * series, iTunes for movies); the chosen image is downloaded into `data/posters`,
 * so the library keeps its covers offline.
 */
export function PosterPicker({ kind, id, query, onPicked }: Props) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(query);
  const [candidates, setCandidates] = useState<Candidate[] | null>(null);
  const [status, setStatus] = useState('');

  useEffect(() => {
    if (!open) return;
    setStatus('Ищу…');
    setCandidates(null);
    api.searchPosters(kind, text)
      .then((r) => {
        setCandidates(r.candidates);
        setStatus(r.candidates.length === 0 ? 'Ничего не нашлось' : '');
      })
      .catch((e: unknown) => setStatus(String(e)));
  }, [open, kind, text]);

  const pick = (candidate: Candidate) => {
    setStatus('Скачиваю…');
    api.pickPoster(kind, id, candidate.poster)
      .then((r) => {
        if (r.poster) {
          onPicked(r.poster);
          setOpen(false);
          setStatus('');
        } else {
          setStatus(r.error ?? 'не удалось');
        }
      })
      .catch((e: unknown) => setStatus(String(e)));
  };

  if (!open) {
    return (
      <button className="btn" onClick={() => setOpen(true)}>
        Обложка
      </button>
    );
  }

  return (
    <div className="picker" role="dialog" aria-label="Выбор обложки">
      <div className="picker__head">
        <input
          className="picker__search"
          type="search"
          value={text}
          autoFocus
          placeholder="Название для поиска"
          aria-label="Название для поиска"
          onChange={(e) => setText(e.target.value)}
        />
        <button className="btn" onClick={() => setOpen(false)}>
          Закрыть
        </button>
      </div>
      {status && <p className="picker__status muted">{status}</p>}
      {candidates && candidates.length > 0 && (
        <ul className="picker__grid">
          {candidates.map((c) => (
            <li key={c.poster}>
              <button className="picker__item" onClick={() => pick(c)} title={`${c.title} (${c.provider})`}>
                <img src={c.poster} alt="" loading="lazy" />
                <span className="picker__label">
                  {c.title}
                  {c.year ? ` · ${c.year}` : ''}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
