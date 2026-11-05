import { useSyncExternalStore } from 'react';

import { DESKTOP_MIN_REM, TABLET_MIN_REM, type LayoutMode } from '@/lib/layout-sizes';

const TABLET_QUERY = `(min-width: ${TABLET_MIN_REM}rem)`;
const DESKTOP_QUERY = `(min-width: ${DESKTOP_MIN_REM}rem)`;

const canMatch = () => typeof window !== 'undefined' && typeof window.matchMedia === 'function';

function read(): LayoutMode {
  if (!canMatch()) return 'phone';
  if (window.matchMedia(DESKTOP_QUERY).matches) return 'desktop';
  return window.matchMedia(TABLET_QUERY).matches ? 'tablet' : 'phone';
}

function subscribe(onChange: () => void) {
  if (!canMatch()) return () => undefined;
  const lists = [window.matchMedia(TABLET_QUERY), window.matchMedia(DESKTOP_QUERY)];
  for (const list of lists) list.addEventListener('change', onChange);
  return () => {
    for (const list of lists) list.removeEventListener('change', onChange);
  };
}

/**
 * Which of the three layouts the window is wide enough for. It is read from the browser's own media queries, the ones the
 * `md:` and `lg:` classes use, and a page re-renders only when the window crosses one of them, not on every pixel of a resize.
 *
 * Where there is no window (the static export draws the pages in Node) and while the page is hydrated it is the phone's: React
 * then draws again with the real one, so what the server drew and what the browser draws first are the same. (The export draws
 * nothing of the app but an empty root, so there is no phone layout to flash; this keeps it that way if it ever does.)
 */
export function useLayoutMode(): LayoutMode {
  return useSyncExternalStore(subscribe, read, () => 'phone');
}
