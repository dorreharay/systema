// What the white surfaces of a page are made of. A card and a field are set apart from the page the same way on every screen, the phone's
// and the wide one's: by a hairline border, never a shadow. A control that is pressed (a filter, the segment that is on) is lifted by a
// ring and a close shadow on a wide screen (`md:`); those classes are written out whole, as Tailwind finds a class by reading it. Nothing
// has a gradient: a button is one flat colour. (docs/desktop-layout.md)

/**
 * How a white card, and a field (the search above a list), are set apart from the page: a hairline border of the line colour (the one the
 * inputs of the forms have), the same on the phone and on a wide screen. The page is nearly white, so white alone does not tell them from
 * it; a shadow is not used for that.
 */
export const SURFACE_EDGE = 'border border-line';

/** A white control that can be pressed (a filter, the segment that is on): a hairline ring and a close shadow, on a wide screen. */
export const PAPER_RAISED = 'md:shadow-[0_0_0_1px_rgba(16,24,40,0.09),0_1px_2px_rgba(16,24,40,0.07)]';
