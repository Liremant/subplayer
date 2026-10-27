import { useEffect, useState } from 'react';
import {
  api,
  episodesCount,
  formatClock,
  formatDuration,
  isFinished,
  label,
  percent,
  resumePoint,
  seasonsCount,
  type Series,
} from './api';
import { Poster } from './Poster';
import { PosterPicker } from './PosterPicker';
import { navigate, playerPath } from './router';

/** Episode rows grouped by season, in numeric order. */
function bySeason(series: Series): { season: number; episodes: typeof series.episodes }[] {
  const map = new Map<number, typeof series.episodes>();
  for (const episode of series.episodes) {
    const key = episode.season ?? 1;
    map.set(key, [...(map.get(key) ?? []), episode]);
  }
  return [...map.entries()]
    .sort(([a], [b]) => a - b)
    .map(([season, episodes]) => ({ season, episodes }));
}

export function SeriesPage({ id }: { id: string }) {
  const [series, setSeries] = useState<Series | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.library()
      .then((lib) => {
        const found = lib.series.find((s) => s.id === id);
        if (found) setSeries(found);
        else setError('Сериал не найден — возможно, папку переименовали.');
      })
      .catch((e: unknown) => setError(String(e)));
  }, [id]);

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
  if (!series) return <main className="screen">Загрузка…</main>;

  const resume = resumePoint(series);
  const watched = series.episodes.filter((e) => isFinished(e.progress)).length;
  const finished = watched === series.episodes.length;

  return (
    <main className="screen">
      <header className="topbar">
        <button className="link" onClick={() => navigate('/')}>
          ← каталог
        </button>
        <span className="topbar__count">{episodesCount(series.episodes.length)}</span>
      </header>

      <section className="hero">
        <Poster src={series.poster} title={series.title} priority />
        <div className="hero__info">
          <h1 className="hero__title">{series.title}</h1>
          <p className="hero__meta">
            {[
              series.year,
              seasonsCount(series.seasons),
              `${watched} из ${series.episodes.length} просмотрено`,
              series.duration ? formatDuration(series.duration) : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>

          {resume && (
            <button
              className="primary hero__resume"
              onClick={() => navigate(playerPath(resume.episode.id))}
              disabled={finished}
            >
              {finished
                ? 'Всё просмотрено'
                : resume.t > 0
                  ? `Продолжить ${label(resume.episode)} с ${formatClock(resume.t)}`
                  : `Смотреть ${label(resume.episode)}`}
            </button>
          )}

          <div className="hero__actions">
            <PosterPicker
              kind="series"
              id={series.id}
              query={series.title}
              onPicked={(poster) => setSeries((s) => s && { ...s, poster })}
            />
            <span className="hero__hint">или положи poster.jpg в папку сериала</span>
          </div>
        </div>
      </section>

      {bySeason(series).map(({ season, episodes }) => (
        <section className="shelf" key={season}>
          <h2 className="shelf__head">Сезон {season}</h2>
          <ul className="episodes">
            {episodes.map((episode) => {
              const p = episode.progress;
              const done = isFinished(p);
              return (
                <li key={episode.id}>
                  <button className="episode" onClick={() => navigate(playerPath(episode.id))}>
                    <span className="episode__num">{label(episode)}</span>
                    {/* An episode's title defaults to the series name — repeating it on
                        every row is noise, so it only shows when it says something new. */}
                    <span className="episode__title" title={episode.title}>
                      {episode.title === series.title ? '' : episode.title}
                    </span>
                    <span className={done ? 'episode__state episode__state--done' : 'episode__state'}>
                      {done
                        ? '✓'
                        : p && p.t > 0
                          ? `${formatClock(p.t)} · ${percent(p)}%`
                          : '—'}
                    </span>
                    <span className="episode__dur">
                      {episode.duration ? formatDuration(episode.duration) : '—'}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </main>
  );
}
