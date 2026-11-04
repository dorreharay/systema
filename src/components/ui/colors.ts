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

// The colour of the button that moves an order to a status: the three colours of the buttons of the home screen, so that
// the order page looks like it (the text and the icon on them are black). They are not the colours of the badges in
// badge.tsx. (The steps of the status scale are in the brand colour, not in these.)
export const statusColors = {
  received: { fill: colors.newOrder },
  in_progress: { fill: colors.clients },
  ready: { fill: colors.catalog },
  completed: { fill: colors.newOrder },
} as const;
