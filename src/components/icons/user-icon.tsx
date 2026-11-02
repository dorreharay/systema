import Svg, { Path } from 'react-native-svg';

type UserIconProps = { size?: number; color?: string };

// The person of assets/images/user.svg, drawn with react-native-svg so that it takes its colour from the
// caller like the other icons do.
export default function UserIcon({ size = 24, color = '#000000' }: UserIconProps) {
  return (
    // The drawing is 75 x 88; the box is made square, with margin, so it is as big as the other icons.
    <Svg width={size} height={size} viewBox="-12.5 -6 100 100" fill="none">
      <Path
        d="M37.5 0C49.574 0 59.375 9.8008 59.375 21.875C59.375 33.9492 49.5742 43.75 37.5 43.75C25.4258 43.75 15.625 33.9492 15.625 21.875C15.625 9.8008 25.4258 0 37.5 0ZM53.125 50C65.207 50 75 59.793 75 71.875V78.125C75 80.6133 74.0117 82.9922 72.2578 84.7578C70.4922 86.5117 68.1133 87.5 65.625 87.5H9.375C6.8867 87.5 4.5078 86.5117 2.7422 84.7578C0.9883 82.9922 0 80.6133 0 78.125V71.875C0 59.793 9.793 50 21.875 50H53.125Z"
        fill={color}
        fillRule="evenodd"
        clipRule="evenodd"
      />
    </Svg>
  );
}
