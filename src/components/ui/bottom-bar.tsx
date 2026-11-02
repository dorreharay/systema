import { BlurView } from 'expo-blur';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { styled } from 'react-native-css';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useKeyboardHeight } from '@/lib/use-keyboard';

const BarBlur = styled(BlurView);

type BottomBarProps = {
  children: ReactNode;
  // Whether the bar clears the home indicator. A page that stands over the navigation does not need to:
  // the navigation does.
  clearHomeIndicator?: boolean;
};

/**
 * A bar fixed at the foot of a page, over its list, with the page's main action in the middle of it, half
 * as wide as the page. Its ground is a blur, so the list can be seen going by under it: the list leaves
 * room at its end (`pb-28`) for the last items to come out from under the bar.
 */
export default function BottomBar({ children, clearHomeIndicator = true }: BottomBarProps) {
  const insets = useSafeAreaInsets();
  const keyboardOpen = useKeyboardHeight() > 0;

  // Where the window shrinks for the keyboard (Android) the bar would ride on top of it: it goes instead.
  if (keyboardOpen) {
    return null;
  }

  return (
    <View className="absolute inset-x-0 bottom-0 overflow-hidden">
      <BarBlur intensity={60} tint="light" className="absolute inset-0" />
      <View style={{ paddingTop: 12, paddingBottom: clearHomeIndicator ? Math.max(insets.bottom, 12) : 12 }}>
        <View className="w-1/2 self-center">{children}</View>
      </View>
    </View>
  );
}
