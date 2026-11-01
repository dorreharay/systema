import { X } from 'lucide-react-native';
import { useEffect, useState, type ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  View,
  useWindowDimensions,
} from 'react-native';
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';

import IconButton from '@/components/ui/icon-button';
import { Text } from '@/components/ui/text';
import { useI18n } from '@/lib/i18n';
import { useKeyboardHeight } from '@/lib/use-keyboard';

type SheetProps = {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  // Pinned under the content, above the keyboard: the primary action of a form in a sheet.
  footer?: ReactNode;
  // Fills most of the screen: for a list that is searched. Otherwise it is as tall as its content.
  tall?: boolean;
  // Wraps the content in a scroll view. Off for a content that is a list itself.
  scroll?: boolean;
};

export const OPEN_MS = 200;
export const CLOSE_MS = 150;
// How long to wait after closing a sheet before showing something else on top.
export const CLOSE_WAIT_MS = 220;
const EASING = Easing.bezier(0.25, 0.1, 0.25, 1);

/**
 * A panel that rises from the bottom over the screen. Simple choices and quick creation happen here,
 * so the page behind it, and whatever was typed in it, stays as it is.
 */
export default function Sheet({
  visible,
  onClose,
  title,
  children,
  footer,
  tall = false,
  scroll = true,
}: SheetProps) {
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const keyboardHeight = useKeyboardHeight();
  const [mounted, setMounted] = useState(visible);
  const progress = useSharedValue(0);

  // It is shown from the first frame it is asked for, and stays until it has slid away.
  if (visible && !mounted) {
    setMounted(true);
  }

  useEffect(() => {
    if (visible) {
      progress.set(withTiming(1, { duration: OPEN_MS, easing: EASING }));
    } else {
      progress.set(
        withTiming(0, { duration: CLOSE_MS, easing: EASING }, (finished) => {
          if (finished) scheduleOnRN(setMounted, false);
        })
      );
    }
  }, [visible, progress]);

  const backdropStyle = useAnimatedStyle(() => ({ opacity: progress.get() }));
  const panelStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: interpolate(progress.get(), [0, 1], [height * 0.4, 0]) }],
    opacity: interpolate(progress.get(), [0, 0.4, 1], [0, 1, 1]),
  }));

  if (!mounted) {
    return null;
  }

  // On iOS the keyboard covers the screen, so the panel is made short enough to stand above it (and
  // scroll inside). On Android the window itself shrinks, and a share of it is enough.
  const ios = Platform.OS === 'ios';
  const maxHeight = ios
    ? Math.min(height * 0.92, height - insets.top - keyboardHeight - 12)
    : ('92%' as const);
  const content = scroll ? (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      contentContainerClassName="px-page pb-4">
      {children}
    </ScrollView>
  ) : (
    children
  );

  return (
    <Modal transparent visible animationType="none" onRequestClose={onClose}>
      <View className="flex-1 justify-end">
        <Animated.View className="absolute inset-0 bg-black/40" style={backdropStyle}>
          <Pressable accessibilityLabel={t('close')} className="flex-1" onPress={onClose} />
        </Animated.View>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <Animated.View
            className="overflow-hidden rounded-t-3xl bg-white"
            style={[panelStyle, tall ? { height: maxHeight } : { maxHeight }]}>
            <View className="items-center pt-2.5">
              <View className="h-1 w-10 rounded-full bg-neutral-300" />
            </View>
            {title ? (
              <View className="flex-row items-center justify-between pb-1 pl-page pr-2 pt-1">
                <Text accessibilityRole="header" className="flex-1 text-[19px] font-semibold">
                  {title}
                </Text>
                <IconButton icon={X} label={t('close')} onPress={onClose} />
              </View>
            ) : null}
            <View className={tall ? 'flex-1' : 'shrink'}>{content}</View>
            {footer ? <View className="px-page pt-2">{footer}</View> : null}
            <View style={{ height: keyboardHeight > 0 ? 12 : Math.max(insets.bottom, 16) }} />
          </Animated.View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}
