// Checks that the widths the layout changes at, and the widths of its columns, are the same in the code and in the styles:
//
//   node scripts/check-layout.mjs
//
// src/lib/layout-sizes.ts says them in rem (TABLET_MIN_REM, DESKTOP_MIN_REM), which `useLayoutMode` asks the browser about, and
// src/global.css says them again as the breakpoints of Tailwind (--breakpoint-md, --breakpoint-lg), which the `md:` and `lg:`
// classes use. If they were to differ, a page would be a tablet's by its classes and a phone's by its code, or the other way
// round. The same goes for the widths of the columns of a page: COLUMN_MAX in layout-sizes.ts (which `useGridColumns` counts with)
// and PAGE_WIDTH_CLASS in src/components/ui/page.tsx (the classes that set them). Exits with 1 when they do. (docs/desktop-layout.md)
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const sizes = readFileSync(`${root}src/lib/layout-sizes.ts`, 'utf8');
const css = readFileSync(`${root}src/global.css`, 'utf8');

const fromCode = (name) => Number(sizes.match(new RegExp(`export const ${name} = (\\d+(?:\\.\\d+)?);`))?.[1]);
const fromCss = (name) => Number(css.match(new RegExp(`--breakpoint-${name}:\\s*(\\d+(?:\\.\\d+)?)rem;`))?.[1]);

const pairs = [
  ['tablet', 'TABLET_MIN_REM', 'md'],
  ['desktop', 'DESKTOP_MIN_REM', 'lg'],
];

let failed = false;
for (const [label, constant, breakpoint] of pairs) {
  const code = fromCode(constant);
  const style = fromCss(breakpoint);
  if (Number.isNaN(code) || Number.isNaN(style)) {
    console.log(`${label}: cannot read ${constant} from layout-sizes.ts or --breakpoint-${breakpoint} from global.css`);
    failed = true;
  } else if (code !== style) {
    console.log(`${label}: ${constant} is ${code}rem but --breakpoint-${breakpoint} is ${style}rem`);
    failed = true;
  } else {
    console.log(`${label}: ${code}rem (${code * 16} px), the same in the code and in the styles`);
  }
}

// The widths of the columns: a number of px in both, or no limit (`Infinity` in the code, `100%` in the class).
const page = readFileSync(`${root}src/components/ui/page.tsx`, 'utf8');
const columnMax = sizes.match(/export const COLUMN_MAX = \{([^}]*)\}/)?.[1] ?? '';
for (const name of ['narrow', 'medium', 'wide']) {
  const codeText = columnMax.match(new RegExp(`${name}:\\s*(\\d+|Infinity)`))?.[1];
  const styleText = page.match(new RegExp(`${name}:\\s*'\\[--page-max:(\\d+px|100%)\\]'`))?.[1];
  const code = codeText === 'Infinity' ? 'no limit' : codeText && `${codeText} px`;
  const style = styleText === '100%' ? 'no limit' : styleText && styleText.replace('px', ' px');
  if (!code || !style) {
    console.log(`${name} column: cannot read COLUMN_MAX.${name} from layout-sizes.ts or PAGE_WIDTH_CLASS.${name} from page.tsx`);
    failed = true;
  } else if (code !== style) {
    console.log(`${name} column: COLUMN_MAX is ${code} but PAGE_WIDTH_CLASS says ${style}`);
    failed = true;
  } else {
    console.log(`${name} column: ${code}, the same in the code and in the classes`);
  }
}

// The room at the sides of a page: PAGE_PADDING in layout-sizes.ts (px) and PAGE_SIDES in page.tsx (`md:px-N`, N quarters of a rem, which
// is 4 px each at the default size).
{
  const code = Number(sizes.match(/export const PAGE_PADDING = (\d+);/)?.[1]);
  const style = Number(page.match(/export const PAGE_SIDES = 'md:px-(\d+)';/)?.[1]) * 4;
  if (Number.isNaN(code) || Number.isNaN(style)) {
    console.log('page sides: cannot read PAGE_PADDING from layout-sizes.ts or PAGE_SIDES from page.tsx');
    failed = true;
  } else if (code !== style) {
    console.log(`page sides: PAGE_PADDING is ${code}px but PAGE_SIDES says ${style}px`);
    failed = true;
  } else {
    console.log(`page sides: ${code} px, the same in the code and in the classes`);
  }
}

process.exit(failed ? 1 : 0);
