import { Catalog } from './Catalog';
import { Player } from './Player';
import { SeriesPage } from './Series';
import { SettingsScreen } from './Settings';
import { decodeSegment, useRoute } from './router';

export function App() {
  const path = useRoute();
  if (path.startsWith('/w/')) {
    const raw = path.slice(3);
    return <Player key={raw} itemId={decodeSegment(raw)} />;
  }
  if (path.startsWith('/s/')) {
    const raw = path.slice(3);
    return <SeriesPage key={raw} id={decodeSegment(raw)} />;
  }
  if (path === '/settings') return <SettingsScreen />;
  return <Catalog />;
}
