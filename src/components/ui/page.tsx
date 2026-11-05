import { createContext, use, type ReactNode } from 'react';
import { View } from 'react-native';

import { useIsDesktop } from '@/lib/layout';

// What a page needs to take part in the wide layouts (tablet and desktop, the web only): how wide its column is, the classes that
// put its scroll view in that column, the main action of the page that moves from the foot of the screen up into its header, and
// the two columns of a desktop page. On the phone none of it does anything. docs/desktop-layout.md.

/** How wide the column of a page is: a narrow one (a detail page, a list of settings), a medium one, or the widest (lists in a grid). */
export type PageWidth = 'narrow' | 'medium' | 'wide';

// The width is a CSS variable, set by the Screen and read by everything inside it: the header and the scroll view are in the same
// column without either knowing how wide it is. (The values are in layout-sizes.ts: COLUMN_MAX.)
export const PAGE_WIDTH_CLASS: Record<PageWidth, string> = {
  narrow: '[--page-max:720px]',
  medium: '[--page-max:960px]',
  // No limit: the column is the whole pane, less its padding.
  wide: '[--page-max:100%]',
};

/** The sides of a wide page (`md:`): 48 px, `p-12`. PAGE_PADDING in layout-sizes.ts is the same number (scripts/check-layout.mjs checks they agree). */
export const PAGE_SIDES = 'md:px-12';

/** The sides of a page: a margin on the phone, a little more on a wide page. Blocks reach past it on the phone, and sit inside it on a wide one (see Card). */
export const PAGE_X = `px-page ${PAGE_SIDES}`;

/** Puts a scroll view's content in the column of the page, in the middle of it. */
export const PAGE_COLUMN = 'md:w-full md:max-w-[var(--page-max)] md:self-center';

/** For the `contentContainerClassName` of the scroll view or the list of a page: the sides, and the column. */
export const PAGE_CONTENT = `${PAGE_X} ${PAGE_COLUMN}`;

// --- The main action of a page ---------------------------------------------------------------

// On the phone the main action of a page is a large button on the dark ground under it (the `dock` of a Screen). On a wide page
// the Screen does not draw it: it passes it on to the header of the page, which shows it among the other actions, as a button of
// the size of a header's.
const DockContext = createContext<ReactNode>(null);

export function DockProvider({ dock, children }: { dock: ReactNode; children: ReactNode }) {
  return <DockContext value={dock}>{children}</DockContext>;
}

/** The main action of the page, for its header to show (nothing on the phone, and on a page that has none). */
export function useDock() {
  return use(DockContext);
}

// A button inside the header's actions is one of a header's size, whatever size it was made for.
const InActionsContext = createContext(false);

export function InPageActions({ children }: { children: ReactNode }) {
  return <InActionsContext value>{children}</InActionsContext>;
}

/** Whether this is a button among the actions of a page header. */
export function useInPageActions() {
  return use(InActionsContext);
}

// --- Two columns -----------------------------------------------------------------------------

type TwoColumnsProps = {
  // What goes in the first column, and in the second. Below a desktop's width they are one after the other, in this order.
  first: ReactNode;
  second: ReactNode;
  // What is above both, the full width of the page: it is drawn first on every size.
  className?: string;
};

/**
 * Cards in two columns side by side on a desktop; one under the other, the first column's first, anywhere else. Each column is
 * a stack with the gap of a page.
 */
export function TwoColumns({ first, second, className = '' }: TwoColumnsProps) {
  const desktop = useIsDesktop();

  if (!desktop) {
    return (
      <>
        {first}
        {second}
      </>
    );
  }
  return (
    <View className={`flex-row items-start gap-4 ${className}`}>
      <View className="min-w-0 flex-1 gap-page">{first}</View>
      <View className="min-w-0 flex-1 gap-page">{second}</View>
    </View>
  );
}

// --- A grid of cards ---------------------------------------------------------------------------

type GridItemProps = {
  // How many cards stand in a row (see `useGridColumns`), where this one is in the list, and how many there are.
  columns: number;
  index: number;
  count: number;
  children: ReactNode;
};

/**
 * What the `renderItem` of a list in a grid returns: the card in a cell of its row, and, after the last card, as many empty cells as
 * the row lacks, so that the cards of the last row are no wider than the others. Where there is one column it is the card as it is.
 */
export function GridItem({ columns, index, count, children }: GridItemProps) {
  if (columns === 1) return <>{children}</>;

  const spare = index === count - 1 ? (columns - (count % columns)) % columns : 0;
  return (
    <>
      <View className="min-w-0 flex-1">{children}</View>
      {Array.from({ length: spare }, (_, cell) => (
        <View key={cell} className="min-w-0 flex-1" />
      ))}
    </>
  );
}
