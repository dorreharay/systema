import Svg, { Path } from 'react-native-svg';

type PlusIconProps = { size?: number; color?: string };

// The plus of assets/images/plus.svg, drawn with react-native-svg so that it takes its colour from the
// caller like the other icons do.
export default function PlusIcon({ size = 24, color = '#000000' }: PlusIconProps) {
  return (
    // The drawing is 95 x 95; the box is made larger, with margin, so it is as big as the other icons.
    <Svg width={size} height={size} viewBox="-12 -12 119 119" fill="none">
      <Path
        d="M53.4374 41.5626V5.9423C53.4374 2.66463 50.7794 0 47.5 0C44.2272 0 41.5626 2.6606 41.5626 5.9423V41.5626H5.9423C2.66463 41.5626 0 44.2206 0 47.5C0 50.7728 2.6606 53.4374 5.9423 53.4374H41.5626V89.0577C41.5626 92.3354 44.2206 95 47.5 95C50.7728 95 53.4374 92.3394 53.4374 89.0577V53.4374H89.0577C92.3354 53.4374 95 50.7794 95 47.5C95 44.2272 92.3394 41.5626 89.0577 41.5626H53.4374Z"
        fill={color}
        fillRule="evenodd"
        clipRule="evenodd"
      />
    </Svg>
  );
}
