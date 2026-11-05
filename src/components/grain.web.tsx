import { View } from 'react-native';

// What is drawn is a rule in web-styles.web.ts, found by this attribute: a tile of noise blended over what is under it. `dataSet` is
// react-native-web's, so it goes in as a spread: React Native's own types do not have it.
const GRAIN = { dataSet: { grain: 'true' } };

/** A fine film grain laid over the ground it is in (the sidebar's), the whole size of it. It takes no touch. */
export default function Grain({ opacity = 0.16 }: { opacity?: number }) {
  return (
    <View
      pointerEvents="none"
      aria-hidden
      {...(GRAIN as object)}
      style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, opacity }}
    />
  );
}
