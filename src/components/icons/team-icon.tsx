import Svg, { G, Path } from 'react-native-svg';

type TeamIconProps = { size?: number; color?: string };

// Two people side by side, drawn from the person of user-icon.tsx (a head and shoulders, 75 x 88), the nearer one larger and both
// standing level: the team.
const PERSON =
  'M37.5 0C49.574 0 59.375 9.8008 59.375 21.875C59.375 33.9492 49.5742 43.75 37.5 43.75C25.4258 43.75 15.625 33.9492 15.625 21.875C15.625 9.8008 25.4258 0 37.5 0ZM53.125 50C65.207 50 75 59.793 75 71.875V78.125C75 80.6133 74.0117 82.9922 72.2578 84.7578C70.4922 86.5117 68.1133 87.5 65.625 87.5H9.375C6.8867 87.5 4.5078 86.5117 2.7422 84.7578C0.9883 82.9922 0 80.6133 0 78.125V71.875C0 59.793 9.793 50 21.875 50H53.125Z';

export default function TeamIcon({ size = 24, color = '#000000' }: TeamIconProps) {
  return (
    // The two together are 116 x 74; the box is made square, with margin, so that the icon is as big as the other icons.
    <Svg width={size} height={size} viewBox="-2 -23 120 120" fill="none">
      <G transform="scale(0.85)">
        <Path d={PERSON} fill={color} fillRule="evenodd" clipRule="evenodd" />
      </G>
      <G transform="translate(66.75 16.65) scale(0.66)">
        <Path d={PERSON} fill={color} fillRule="evenodd" clipRule="evenodd" />
      </G>
    </Svg>
  );
}
