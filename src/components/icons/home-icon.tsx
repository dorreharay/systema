import Svg, { Path } from 'react-native-svg';

type HomeIconProps = { size?: number; color?: string };

// The house of assets/images/home.svg, drawn with react-native-svg so that it takes its colour from the
// caller like the other icons do (Metro cannot import an .svg file as a component here).
export default function HomeIcon({ size = 24, color = '#000000' }: HomeIconProps) {
  return (
    // The house fills its 90 x 90 box edge to edge; the extra margin makes it as big as the outline icons.
    <Svg width={size} height={size} viewBox="-6 -6 102 102" fill="none">
      <Path
        d="M40.8555 1.42965L2.3125 33.3987C0.8555 34.6057 0 36.4299 0 38.3479V83.2109C0 86.7304 2.8008 89.5859 6.25 89.5859H83.332C86.7812 89.5859 89.582 86.7304 89.582 83.2109V38.3479C89.582 36.4299 88.7383 34.6096 87.2695 33.3987L48.7305 1.42965C46.4375 -0.47655 43.1485 -0.47655 40.8438 1.42965H40.8555Z"
        fill={color}
      />
    </Svg>
  );
}
