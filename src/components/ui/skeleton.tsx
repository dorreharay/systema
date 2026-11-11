import { useEffect } from 'react';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { View, type StyleProp, type ViewStyle } from 'react-native';

import { BLOCK, BLOCK_ROOM, BLOCK_SHAPE } from '@/components/ui/card';
import { CARD_GAP } from '@/components/ui/page';
import { useI18n } from '@/lib/i18n';

// A grey block that pulses where something is still loading.
export function Skeleton({ className = '', style }: { className?: string; style?: StyleProp<ViewStyle> }) {
  const pulse = useSharedValue(0);

  useEffect(() => {
    pulse.set(withRepeat(withTiming(1, { duration: 800, easing: Easing.inOut(Easing.quad) }), -1, true));
  }, [pulse]);

  const pulseStyle = useAnimatedStyle(() => ({ opacity: 0.45 + pulse.get() * 0.55 }));

  return <Animated.View className={`rounded-md bg-neutral-200 ${className}`} style={[style, pulseStyle]} />;
}

/** A grey block the shape of a white block of a page (from edge to edge), for a page that is still loading. */
export function BlockSkeleton({ className = '' }: { className?: string }) {
  // The rounding is the wrapper's: the block inside is square, and is cut to it.
  return (
    <View className={`${BLOCK_SHAPE} overflow-hidden`}>
      <Skeleton className={className} />
    </View>
  );
}

export function OrderCardSkeleton() {
  const { t } = useI18n();
  return (
    <View className={`${BLOCK} ${BLOCK_ROOM} gap-3`} accessibilityLabel={t('loading')}>
      <View className="flex-row items-center justify-between">
        <Skeleton className="h-5 w-36" />
        <Skeleton className="h-6 w-20 rounded-full" />
      </View>
      <Skeleton className="h-4 w-48" />
      <Skeleton className="h-4 w-40" />
      <View className="flex-row items-center justify-between pt-1">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-5 w-16" />
      </View>
    </View>
  );
}

export function RowSkeleton() {
  return (
    <View className={`${BLOCK} ${BLOCK_ROOM} flex-row items-center gap-3`}>
      <Skeleton className="size-11 rounded-full" />
      <View className="flex-1 gap-2">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-3.5 w-28" />
      </View>
    </View>
  );
}

export function ListSkeleton({ rows = 4, variant = 'order' }: { rows?: number; variant?: 'order' | 'row' }) {
  return (
    <View className={CARD_GAP}>
      {Array.from({ length: rows }, (_, index) =>
        variant === 'order' ? <OrderCardSkeleton key={index} /> : <RowSkeleton key={index} />
      )}
    </View>
  );
}
