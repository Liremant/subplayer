import { useEffect, useState } from 'react';

/** Three routes, so the platform History API is enough — no router dependency. */
export function useRoute(): string {
  const [path, setPath] = useState(() => location.pathname);
  useEffect(() => {
    const update = () => setPath(location.pathname);
    window.addEventListener('popstate', update);
    window.addEventListener('subplayer:route', update);
    return () => {
      window.removeEventListener('popstate', update);
      window.removeEventListener('subplayer:route', update);
    };
  }, []);
  return path;
}

export function navigate(to: string): void {
  if (to === location.pathname) return;
  history.pushState(null, '', to);
  window.dispatchEvent(new Event('subplayer:route'));
}

export function playerPath(id: string): string {
  return `/w/${encodeURIComponent(id)}`;
}

export function seriesPath(id: string): string {
  return `/s/${encodeURIComponent(id)}`;
}

/** Decodes a path segment without letting a malformed escape crash the route. */
export function decodeSegment(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}
