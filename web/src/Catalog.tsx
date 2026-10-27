import { useEffect, useMemo, useState } from 'react';
import {
  api,
  defaultSettings,
  episodesCount,
  formatClock,
  formatDuration,
  isFinished,
  itemsCount,
  label,
  percent,
  resumePoint,
  seriesActivity,
  SORT_LABELS,
  type Item,
  type Library,
  type Series,
  type Settings,
  type Sort,
} from './api';
import { Poster } from './Poster';
import { Select } from './Select';
import { navigate, playerPath, seriesPath } from './router';

type Filter = 'all' | 'movie' | 'series';

const FILTERS: { id: Filter; text: string }[] = [
  { id: 'all', text: 'Все' },
  { id: 'movie', text: 'Фильмы' },
  { id: 'series', text: 'Сериалы' },
];

/** One grid, two kinds of card — the filter decides what is visible, not a section head. */
type Entry =
  | { kind: 'movie'; title: string; activity: number; added: number; item: Item }
  | { kind: 'series'; title: string; activity: number; added: number; series: Series };

/** Line 2: where the user stopped. Line 3 carries the metadata, kept separate on purpose. */
function ProgressLine({ item }: { item: Item }) {
  const p = item.progress;
  if (!p || p.t <= 0) return <span className="card__progress card__progress--idle">не начато</span>;
  if (isFinished(p)) return <span className="card__progress card__progress--done">просмотрено</span>;
  return (
    <span className="card__progress">
      смотреть с {formatClock(p.t)}
      <span className="card__bar" aria-hidden="true">
        <span className="card__fill" style={{ width: `${percent(p)}%` }} />
      </span>
    </span>
  );
}

function MovieCard({ item }: { item: Item }) {
  const meta = [item.year, 'фильм', item.duration ? formatDuration(item.duration) : null]
    .filter(Boolean)
    .join(' · ');
  return (
    <li className="card">
      <button className="card__open" onClick={() => navigate(playerPath(item.id))}>
        <Poster src={item.poster} title={item.title} />
        <span className="card__title" title={item.title}>
          {item.title}
        </span>
        <ProgressLine item={item} />
        <span className="card__meta">{meta}</span>
      </button>
    </li>
  );
}

function SeriesCard({ series }: { series: Series }) {
  const resume = resumePoint(series);
  const allWatched = series.episodes.length > 0 && series.episodes.every((e) => isFinished(e.progress));
  const meta = [
    series.year,
    episodesCount(series.episodes.length),
    series.seasons > 1 ? `${series.seasons} сез.` : null,
    series.duration ? formatDuration(series.duration) : null,
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <li className="card">
      <button className="card__open" onClick={() => navigate(seriesPath(series.id))}>
        <Poster src={series.poster} title={series.title} />
        <span className="card__title" title={series.title}>
          {series.title}
        </span>
        {!resume ? (
          <span className="card__progress card__progress--idle">нет эпизодов</span>
        ) : allWatched ? (
          <span className="card__progress card__progress--done">просмотрено</span>
        ) : (
          <span className="card__progress">
            {label(resume.episode)}
            {resume.t > 0 ? ` · с ${formatClock(resume.t)}` : ' · начать'}
          </span>
        )}
        <span className="card__meta">{meta}</span>
      </button>
    </li>
  );
}

export function Catalog() {
  const [library, setLibrary] = useState<Library | null>(null);
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');

  useEffect(() => {
    Promise.all([api.library(), api.settings()])
      .then(([lib, loaded]) => {
        setLibrary(lib);
        setSettings(loaded);
      })
      .catch((e: unknown) => setError(String(e)));
  }, []);

  const visible = useMemo(() => {
    if (!library) return [];
    const q = query.trim().toLowerCase();
    const entries: Entry[] = [];

    if (filter !== 'series') {
      for (const item of library.movies) {
        if (q && !item.title.toLowerCase().includes(q)) continue;
        entries.push({
          kind: 'movie',
          title: item.title,
          activity: item.progress?.updated ?? 0,
          added: item.added,
          item,
        });
      }
    }
    if (filter !== 'movie') {
      for (const series of library.series) {
        if (q && !series.title.toLowerCase().includes(q)) continue;
        entries.push({
          kind: 'series',
          title: series.title,
          activity: seriesActivity(series),
          added: series.episodes.reduce((max, e) => Math.max(max, e.added), 0),
          series,
        });
      }
    }

    const byTitle = (a: Entry, b: Entry) => a.title.localeCompare(b.title, 'ru');
    if (settings.sort === 'alpha') return entries.sort(byTitle);
    if (settings.sort === 'added') return entries.sort((a, b) => b.added - a.added || byTitle(a, b));
    // "recent": most recently watched first, then whatever was added last.
    return entries.sort((a, b) => b.activity - a.activity || b.added - a.added || byTitle(a, b));
  }, [library, filter, query, settings.sort]);

  const setSort = (sort: Sort) => {
    const next = { ...settings, sort };
    setSettings(next);
    api.saveSettings(next).catch(() => {});
  };

  const total = library ? library.movies.length + library.series.length : 0;

  return (
    <main className="screen">
      <header className="topbar">
        <h1 className="topbar__brand">subplayer</h1>
        <span className="topbar__count">{library ? itemsCount(total) : ''}</span>
        <button className="link" onClick={() => navigate('/settings')}>
          Настройки
        </button>
      </header>

      <div className="filters">
        <input
          className="filters__search"
          type="search"
          value={query}
          placeholder="Поиск по названию"
          aria-label="Поиск по названию"
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="chips" role="group" aria-label="Фильтр по типу">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              className={f.id === filter ? 'chip chip--on' : 'chip'}
              aria-pressed={f.id === filter}
              onClick={() => setFilter(f.id)}
            >
              {f.text}
            </button>
          ))}
        </div>
        <div className="sort">
          <span className="sort__label">Сортировка</span>
          <Select
            label="Сортировка"
            value={settings.sort}
            onChange={setSort}
            options={(Object.keys(SORT_LABELS) as Sort[]).map((s) => ({ value: s, label: SORT_LABELS[s] }))}
          />
        </div>
      </div>

      {error && <p className="error">{error}</p>}
      {!library && !error && <p className="muted">Сканирую папку…</p>}

      {library && total === 0 && (
        <p className="muted">
          Пусто. Положи <code>media/&lt;папка&gt;/video.mp4</code> и <code>subs.vtt</code> — появится здесь.
        </p>
      )}

      {visible.length > 0 && (
        <ul className="grid">
          {visible.map((entry) =>
            entry.kind === 'movie' ? (
              <MovieCard key={entry.item.id} item={entry.item} />
            ) : (
              <SeriesCard key={entry.series.id} series={entry.series} />
            ),
          )}
        </ul>
      )}

      {library && total > 0 && visible.length === 0 && <p className="muted">Ничего не нашлось.</p>}
    </main>
  );
}
