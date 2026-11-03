import Svg, { Path } from 'react-native-svg';

type CatalogIconProps = { size?: number; color?: string };

// The box of assets/images/catalog.svg, drawn with react-native-svg so that it takes its colour from the
// caller like the other icons do.
export default function CatalogIcon({ size = 24, color = '#000000' }: CatalogIconProps) {
  return (
    // The drawing is 26 x 21; the box is made square, with margin, so it is as big as the other icons.
    <Svg width={size} height={size} viewBox="-1.75 -4.25 29.5 29.5" fill="none">
      <Path
        d="M25 0H1C0.447715 0 0 0.447715 0 1V4C0 4.55228 0.447716 5 1 5H25C25.5523 5 26 4.55228 26 4V1C26 0.447715 25.5523 0 25 0Z"
        fill={color}
      />
      <Path d="M2 21H24V5H2V21ZM9.5 7H16.5V9H9.5V7Z" fill={color} />
    </Svg>
  );
}
