export type Kind = 'movie' | 'episode';
export type Mode = 'both' | 'orig' | 'trans' | 'off';
export type Sort = 'recent' | 'alpha' | 'added';

export interface Progress {
  t: number;
  dur: number;
  shift?: number | null;
  /** Unix seconds of the last save. */
  updated: number;
}

export interface Item {
  id: string;
  kind: Kind;
  title: string;
  series: string | null;
  season: number | null;
  episode: number | null;
  year: number | null;
  duration: number | null;
  added: number;
  video: string;
  subs: string | null;
  poster: string | null;
  progress?: Progress | null;
}

export interface Series {
  id: string;
  title: string;
  year: number | null;
  poster: string | null;
  seasons: number;
  duration: number | null;
  episodes: Item[];
}

export interface Library {
  movies: Item[];
  series: Series[];
}

export interface Settings {
  mode: Mode;
  size: number;
  /** Subtitle block centre, percent of the video box. */
  posX: number;
  posY: number;
  shift: number;
  rate: number;
  showPrev: boolean;
  sort: Sort;
}

export interface Candidate {
  provider: string;
  title: string;
  year: number | null;
  poster: string;
}

export const defaultSettings: Settings = {
  mode: 'both',
  size: 26,
  posX: 50,
  posY: 86,
  shift: 0,
  rate: 1,
  showPrev: false,
  sort: 'recent',
};

export const MODE_LABELS: Record<Mode, string> = {
  both: 'оба',
  orig: 'оригинал',
  trans: 'перевод',
  off: 'выкл',
};

export const MODE_LONG: Record<Mode, string> = {
  both: 'оригинал + перевод',
  orig: 'только оригинал',
  trans: 'только перевод',
  off: 'выключены',
};

export const SORT_LABELS: Record<Sort, string> = {
  recent: 'Последние просмотренные',
  alpha: 'По алфавиту',
  added: 'Недавно добавленные',
};

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json() as Promise<T>;
}

export const api = {
  library: () => fetch('/api/library').then(json<Library>),
  settings: () => fetch('/api/settings').then(json<Settings>),
  saveSettings: (settings: Settings) =>
    fetch('/api/settings', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(settings),
    }).then(json<Settings>),
  saveProgress: (id: string, t: number, dur: number, shift?: number | null) =>
    fetch('/api/progress', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      keepalive: true,
      body: JSON.stringify({ id, t, dur, shift }),
    }).then(json<{ ok: boolean }>),
  searchPosters: (kind: 'movie' | 'series', q: string) =>
    fetch(`/api/posters/search?kind=${kind}&q=${encodeURIComponent(q)}`).then(
      json<{ candidates: Candidate[] }>,
    ),
  pickPoster: (kind: 'movie' | 'series', id: string, url: string) =>
    fetch('/api/posters', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ kind, id, url }),
    }).then(json<{ poster: string | null; error?: string }>),
};

/** Encodes each path segment, so spaces and parens in folder names just work. */
export function mediaUrl(relPath: string): string {
  return `/media/${relPath.split('/').map(encodeURIComponent).join('/')}`;
}

export function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** `S01E03` badge for episodes, `2021` for movies. */
export function label(item: Item): string {
  if (item.kind === 'episode' && item.season != null && item.episode != null) {
    return `S${pad(item.season)}E${pad(item.episode)}`;
  }
  return item.year ? String(item.year) : '';
}

export function formatDuration(seconds: number): string {
  // A "video" longer than 100 hours is a bad meta.json or a corrupt header, not a length.
  if (!Number.isFinite(seconds) || seconds <= 0 || seconds > 360_000) return '—';
  const total = Math.round(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

/** `0:12:41` — the position, shown as "продолжить с …". */
export function formatClock(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '0:00';
  const total = Math.floor(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

export function isFinished(progress: Progress | null | undefined): boolean {
  if (!progress || progress.dur <= 0) return false;
  return progress.t >= progress.dur - 10;
}

export function percent(progress: Progress | null | undefined): number {
  if (!progress || progress.dur <= 0 || progress.t <= 0) return 0;
  return Math.min(Math.round((progress.t / progress.dur) * 100), 100);
}

/** Where "continue" should jump: the last unfinished episode, else the next one. */
export function resumePoint(series: Series): { episode: Item; t: number } | null {
  const watched = series.episodes.filter((e) => e.progress && e.progress.t > 0);
  if (watched.length === 0) {
    const first = series.episodes[0];
    return first ? { episode: first, t: 0 } : null;
  }
  const last = watched.reduce((a, b) => (b.progress!.updated > a.progress!.updated ? b : a));
  if (!isFinished(last.progress)) return { episode: last, t: last.progress!.t };
  const next = series.episodes[series.episodes.indexOf(last) + 1];
  return next ? { episode: next, t: 0 } : { episode: last, t: last.progress!.t };
}

/** Most recent save across the series, for the "recent" sort and the card's progress line. */
export function seriesActivity(series: Series): number {
  return series.episodes.reduce((max, e) => Math.max(max, e.progress?.updated ?? 0), 0);
}

export function seriesWatched(series: Series): number {
  return series.episodes.filter((e) => isFinished(e.progress)).length;
}

export function sortItems<T extends { title: string }>(
  items: T[],
  sort: Sort,
  activity: (item: T) => number,
  added: (item: T) => number,
): T[] {
  const copy = [...items];
  if (sort === 'alpha') return copy.sort((a, b) => a.title.localeCompare(b.title, 'ru'));
  if (sort === 'added') return copy.sort((a, b) => added(b) - added(a));
  return copy.sort((a, b) => activity(b) - activity(a) || added(b) - added(a));
}

const ruPlural = new Intl.PluralRules('ru');

/** "1 материал / 2 материала / 5 материалов" — a hardcoded plural is wrong for one of them. */
export function itemsCount(n: number): string {
  const forms: Record<string, string> = { one: 'материал', few: 'материала', many: 'материалов' };
  return `${n} ${forms[ruPlural.select(n)] ?? forms.many}`;
}

export function episodesCount(n: number): string {
  const forms: Record<string, string> = { one: 'эпизод', few: 'эпизода', many: 'эпизодов' };
  return `${n} ${forms[ruPlural.select(n)] ?? forms.many}`;
}

export function seasonsCount(n: number): string {
  const forms: Record<string, string> = { one: 'сезон', few: 'сезона', many: 'сезонов' };
  return `${n} ${forms[ruPlural.select(n)] ?? forms.many}`;
}
