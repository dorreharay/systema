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
  danger: '#B42318',
  white: '#ffffff',
  // The track of a switch that is off: 3.6:1 on white, where the pale grey it replaces was 1.5:1 and the
  // switch vanished into the page (a control needs 3:1).
  switchOff: '#7c8799',
  // The dark band under the pages (see global.css).
  chrome: '#1A1A1A',
  // The New Order shortcut: a soft blue, as light and as muted as the yellow of Clients and the green of
  // Catalog beside it (see home.tsx).
  newOrder: '#C3DDF0',
  // The colours of the Clients and the Catalog shortcuts on the home screen, and of the buttons that add to
  // them (a client, a racket, a string).
  clients: '#F3D590',
  catalog: '#CCE7AC',
  // A soft red for a button that takes something away, with its text (5.7:1 on it).
  dangerSoft: '#FBE4E1',
  dangerInk: '#B42318',
} as const;

// The button that moves an order to a status has a colour for that status: its fill, and the text on it. It
// follows the badge in badge.tsx, except for "completed": the badge is grey, which on a button reads as
// disabled, so the hand-over is violet.
export const statusButton = {
  received: { fill: '#DBEAFE', ink: '#1E40AF' },
  in_progress: { fill: '#FDE68A', ink: '#78350F' },
  ready: { fill: '#A7F3D0', ink: '#064E3B' },
  completed: { fill: '#DDD6FE', ink: '#4C1D95' },
} as const;
