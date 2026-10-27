import { useState } from 'react';

interface Props {
  src: string | null;
  title: string;
  /** `2 / 3` for cards, `16 / 9` for the wide hero on a series page. */
  ratio?: '2 / 3' | '16 / 9';
  /** Above-the-fold posters load eagerly — a lazy LCP image is a slow LCP image. */
  priority?: boolean;
}

/** A poster that degrades to a typographic tile: no broken-image icon, no layout shift. */
export function Poster({ src, title, ratio = '2 / 3', priority = false }: Props) {
  const [failed, setFailed] = useState(false);
  const show = src && !failed;
  return (
    <div className="poster" style={{ aspectRatio: ratio }} data-empty={show ? undefined : ''}>
      {show ? (
        <img
          src={src}
          alt=""
          loading={priority ? 'eager' : 'lazy'}
          fetchPriority={priority ? 'high' : 'auto'}
          decoding="async"
          onError={() => setFailed(true)}
        />
      ) : (
        <span className="poster__initial" aria-hidden="true">
          {title.trim().charAt(0).toUpperCase() || '?'}
        </span>
      )}
    </div>
  );
}
