import { Text as NativeText, type TextProps } from 'react-native';

// A class that sets the color. When there is none, text is dark.
const HAS_COLOR =
  /(^|\s)text-(ink|muted|white|primary|danger|secondary|black|transparent|(red|green|blue|amber|emerald|neutral|gray|slate|orange|yellow|sky)-\d+)/;

/**
 * The app's text: Euclid regular and dark by default. A heavier `font-*` class in `className` wins (the
 * weights are in global.css, in order), and so does any text color.
 */
export function Text({ className = '', ...props }: TextProps & { className?: string }) {
  return (
    <NativeText
      className={`font-normal ${HAS_COLOR.test(className) ? '' : 'text-ink'} ${className}`}
      {...props}
    />
  );
}
