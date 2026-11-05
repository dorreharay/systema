// What the web build needs from CSS that a class cannot say: the ring on what the keyboard has reached, and thin scroll bars where
// there is a mouse. It is put in the page as a style element, once, when the app starts (nothing is drawn on the server for it to be
// in: the static export has only an empty root). It is here, and not in global.css, because global.css is compiled for the phone too.
const ID = 'restring-web-styles';

// The grain: a tile of fine noise, which the browser draws itself (a turbulence filter, in grey), so that there is no picture to carry.
const GRAIN_TILE = encodeURIComponent(
  "<svg xmlns='http://www.w3.org/2000/svg' width='180' height='180'>" +
    "<filter id='n' x='0' y='0' width='100%' height='100%'>" +
    "<feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/>" +
    "<feColorMatrix type='saturate' values='0'/>" +
    '</filter>' +
    "<rect width='100%' height='100%' filter='url(#n)'/>" +
    '</svg>'
);

const CSS = `
/* The keyboard: a ring on whatever it has reached, and none for a click. Fields show their focus with their own border. The ring is
   inside the edge of what has the focus, not outside it: the rows of a list and the cards are in blocks that cut off what is outside
   them (the rounded corners of a group), and a ring outside would be cut off with it. */
:focus-visible:not(input):not(textarea) {
  outline: 2px solid #173c32;
  outline-offset: -2px;
}
/* On the dark of the sidebar and of the photo (a View marked with data-on-dark) the ring is white. */
[data-on-dark] :focus-visible:not(input):not(textarea) {
  outline-color: #ffffff;
}
input:focus-visible,
textarea:focus-visible {
  outline: none;
}

/* The sidebar: the dark of the navigation, with a soft green light at its foot. */
[data-sidebar] {
  background-image: radial-gradient(120% 50% at 50% 112%, rgba(47, 125, 98, 0.4), rgba(47, 125, 98, 0) 64%);
}
/* The grain (components/grain.web.tsx): the tile laid over what is under it. */
[data-grain] {
  background-image: url("data:image/svg+xml,${GRAIN_TILE}");
  background-size: 180px 180px;
  mix-blend-mode: overlay;
}
/* A whole that takes the keys (the table of orders) has no ring of its own: what is in it shows where the cursor is. */
[data-no-ring]:focus-visible {
  outline: none;
}

/* A mouse has a scroll bar that takes room: the thin one, in the colour of a hairline, over the pages. */
@media (hover: hover) and (pointer: fine) {
  * {
    scrollbar-width: thin;
    scrollbar-color: #c2c8d0 transparent;
  }
}
`;

if (typeof document !== 'undefined' && !document.getElementById(ID)) {
  const style = document.createElement('style');
  style.id = ID;
  style.textContent = CSS;
  document.head.appendChild(style);
}
