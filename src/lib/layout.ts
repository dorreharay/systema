import { useWindowDimensions } from 'react-native';

import { useLayoutMode } from '@/lib/layout-mode';
import { COLUMN_MAX, GRID_GAP, PAGE_PADDING, SHELL_MARGIN, SIDEBAR_WIDTH } from '@/lib/layout-sizes';

// What a screen uses to know how wide the window is: `useLayoutMode()` (phone, tablet or desktop), the two questions made from
// it, and the number of columns for a grid. For styling use the `md:` and `lg:` classes instead where a class can say it: they
// are CSS, and do not need the page to draw again. This is for what changes the structure (a sidebar or tabs, a grid or a pager).
export * from '@/lib/layout-sizes';
export { useLayoutMode };

/** There is a sidebar and the pages are wide pages: tablet and desktop, which only the web can be. */
export function useIsWide() {
  return useLayoutMode() !== 'phone';
}

/** The window is a desktop's (1024 px and up). */
export function useIsDesktop() {
  return useLayoutMode() === 'desktop';
}

/** How wide what is inside the column of a page is (0 on the phone), worked out from the window as `useGridColumns` does. */
export function usePageInnerWidth(column: keyof typeof COLUMN_MAX = 'wide') {
  const mode = useLayoutMode();
  const { width } = useWindowDimensions();
  if (mode === 'phone') return 0;
  const pane = width - SIDEBAR_WIDTH[mode] - SHELL_MARGIN * 2;
  return Math.min(pane, COLUMN_MAX[column]) - 2 * PAGE_PADDING;
}

/**
 * How many cards that are at least `minWidth` wide fit side by side in the column of a page, at most `max` (six: the widest column
 * has no limit, so on a big monitor the cards are kept from growing too wide by more columns, not by fewer). One on the phone.
 * The room is worked out from the window and the sizes in layout-sizes.ts, not measured, so that the first draw is already right.
 */
export function useGridColumns(minWidth: number, max = 6, column: keyof typeof COLUMN_MAX = 'wide') {
  const mode = useLayoutMode();
  const { width } = useWindowDimensions();
  if (mode === 'phone') return 1;
  const pane = width - SIDEBAR_WIDTH[mode] - SHELL_MARGIN * 2;
  const inner = Math.min(pane, COLUMN_MAX[column]) - 2 * PAGE_PADDING;
  return Math.max(1, Math.min(max, Math.floor((inner + GRID_GAP) / (minWidth + GRID_GAP))));
}
