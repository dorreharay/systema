// How round the corners of a button are.
//
// On the phone (iOS, and a browser window under 768 px) they are what they have always been. On a wide screen (the sidebar and the
// dialogs: docs/desktop-layout.md) every button is 15% less round: its radius times 0.85. A class that is only for a wide screen is
// `md:`, so a radius is written here as the two together, and written out whole, as Tailwind finds a class by reading it. A new
// button takes its corners from here, not from `rounded-lg`. Fields, cards, dialogs and badges are not buttons and keep theirs.

/** What a radius is multiplied by on a wide screen. The classes below are written with that already done. */
export const WIDE_RADIUS_SCALE = 0.85;

export const BUTTON_RADIUS = {
  // Tailwind's own radii, which are in rem: 0.375, 0.5 and 0.75, times 0.85.
  md: 'rounded-md md:rounded-[0.31875rem]',
  lg: 'rounded-lg md:rounded-[0.425rem]',
  xl: 'rounded-xl md:rounded-[0.6375rem]',
  // The corners of the shortcuts, which are in px: 18 and 15, times 0.85.
  px18: 'rounded-[18px] md:rounded-[15.3px]',
  px15: 'rounded-[15px] md:rounded-[12.75px]',
  // A circle or a pill (`rounded-full`) is rounded by half of its height; 15% less than that is 0.85 of the half. The heights are
  // Tailwind's, in rem: h-8 (2rem), size-9 (2.25rem), size-11 (2.75rem), size-12 (3rem).
  full32: 'rounded-full md:rounded-[0.85rem]',
  full36: 'rounded-full md:rounded-[0.95625rem]',
  full44: 'rounded-full md:rounded-[1.16875rem]',
  full48: 'rounded-full md:rounded-[1.275rem]',
} as const;
