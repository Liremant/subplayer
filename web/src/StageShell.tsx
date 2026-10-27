import { useContainerAttach } from '@videojs/react';
import { useEffect, useRef, type ReactNode } from 'react';

/**
 * The element fullscreen targets.
 *
 * Video.js fullscreens its *container*, and by default that container is the skin's own
 * root — which means anything placed outside the skin vanishes in fullscreen. Registering
 * this wrapper instead puts the video and the dialogue panel inside one fullscreen box,
 * so the panel can sit beside the video rather than floating over it.
 */
export function StageShell({ children }: { children: ReactNode }) {
  const setContainer = useContainerAttach();
  const shell = useRef<HTMLDivElement | null>(null);

  // The skin registers itself as the container when it mounts; this runs after, so the
  // wrapper wins. `setContainer` is undefined outside a player, and `ref={undefined}` is
  // harmless — but then fullscreen falls back to the skin, which still works.
  useEffect(() => {
    setContainer?.(shell.current);
  }, [setContainer]);

  return (
    <div className="stage-shell" ref={shell}>
      {children}
    </div>
  );
}
