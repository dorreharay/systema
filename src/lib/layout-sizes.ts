// The one definition of the widths the layout changes at, and of the measures that follow from them (docs/desktop-layout.md).
//
// Below TABLET_MIN the app is the phone's: the tabs under the page, the buttons at the foot, the sheets that rise from the
// bottom. From TABLET_MIN there is a sidebar in place of the tabs and the sheets are dialogs. From DESKTOP_MIN the sidebar is
// wider and the pages use the room: grids, two columns, the forms side by side.
//
// The two are in rem, which is how Tailwind counts its breakpoints (`md:` and `lg:` are these two, see --breakpoint-md and
// --breakpoint-lg in global.css; `node scripts/check-layout.mjs` checks that they agree), so that the classes and `useLayoutMode`
// change at the same width when someone has set a larger font in the browser. 16 px to the rem at the default size.
export const TABLET_MIN_REM = 48; // 768 px: `md:`
export const DESKTOP_MIN_REM = 64; // 1024 px: `lg:`

export type LayoutMode = 'phone' | 'tablet' | 'desktop';

/** The width of the sidebar, in px. */
export const SIDEBAR_WIDTH = { tablet: 232, desktop: 248 } as const;
/** The slot of the wordmark at the top of the sidebar: where the logo of the intro lands when it docks (see AppHeader). */
export const SIDEBAR_LOGO_SLOT = { top: 28, height: 32 } as const;
/** The room between the page and the edges of the window, round its rounded corners (the dark ground shows through). */
export const SHELL_MARGIN = 8;
/** The room round a page that is wide enough for a sidebar, `p-12`: at its sides (`md:px-12`: PAGE_SIDES in components/ui/page.tsx), above its header and under its content. */
export const PAGE_PADDING = 48;
/**
 * The widest a column of a page is, padding and all: a narrow one (a list of settings, a page of one column), a medium one (a page in
 * two columns), and the widest (a grid of cards, the table of orders), which has no limit: it is the whole pane, less the padding.
 * The same three are in PAGE_WIDTH_CLASS in components/ui/page.tsx, as the classes that set them (`100%` for the one that has no
 * limit; scripts/check-layout.mjs checks they agree).
 */
export const COLUMN_MAX = { narrow: 720, medium: 960, wide: Infinity } as const;
/** The space between the cards of a grid. */
export const GRID_GAP = 12;
