// The same colors as the Tailwind tokens in global.css, for the places that take a color value (icons,
// placeholders, switches) and not a class.
export const colors = {
  primary: '#173c32',
  primarySoft: '#e6efeb',
  ink: '#12171c',
  muted: '#667085',
  placeholder: '#98a2b3',
  line: '#e3e5e8',
  surface: '#f4f5f6',
  danger: '#d92d20',
  white: '#ffffff',
  // The track of a switch that is off: 3.6:1 on white, where the pale grey it replaces was 1.5:1 and the
  // switch vanished into the page (a control needs 3:1).
  switchOff: '#7c8799',
  // The dark band under the pages (see global.css).
  chrome: '#1A1A1A',
  // The New Order shortcut: a soft blue, as light and as muted as the yellow of Clients and the green of
  // Catalog beside it (see home.tsx).
  newOrder: '#C3DDF0',
} as const;
