// What the desktop's "paper" look is made of: soft depth. A white surface (a card, a control that is pressed, a field) is lifted off
// the page by a hairline ring and a few shadows, not by a border, and nothing has a gradient: a button is one flat colour. These are
// classes for a wide screen (`md:`), written out whole, as Tailwind finds a class by reading it; the phone has none of them.
// (docs/desktop-layout.md)

/** A white card: a hairline ring, a close shadow, and a wide soft one under it. */
export const PAPER_CARD =
  'md:shadow-[0_0_0_1px_rgba(16,24,40,0.05),0_1px_2px_rgba(16,24,40,0.04),0_10px_24px_-14px_rgba(16,24,40,0.16)]';

/** A white control that can be pressed (a filter, the segment that is on): a ring a little darker than the card's, and a close shadow. */
export const PAPER_RAISED = 'md:shadow-[0_0_0_1px_rgba(16,24,40,0.09),0_1px_2px_rgba(16,24,40,0.07)]';

/** A field that is typed in: pressed into the page, with a ring round it in place of the border. */
export const PAPER_FIELD = 'md:border-transparent md:shadow-[inset_0_1px_3px_rgba(16,24,40,0.1),0_0_0_1px_#dfe2e6]';
