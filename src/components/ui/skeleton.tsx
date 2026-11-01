import { useEffect } from 'react';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { View } from 'react-native';

// A grey block that pulses where something is still loading.
export function Skeleton({ className = '' }: { className?: string }) {
  const pulse = useSharedValue(0);

  useEffect(() => {
    pulse.set(withRepeat(withTiming(1, { duration: 800, easing: Easing.inOut(Easing.quad) }), -1, true));
  }, [pulse]);

  const style = useAnimatedStyle(() => ({ opacity: 0.45 + pulse.get() * 0.55 }));

  return <Animated.View className={`rounded-md bg-neutral-200 ${className}`} style={style} />;
}

export function OrderCardSkeleton() {
  return (
    <View className="gap-3 rounded-2xl border border-line bg-white p-4" accessibilityLabel="Loading">
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
    <View className="flex-row items-center gap-3 rounded-2xl border border-line bg-white p-4">
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
    <View className="gap-3">
      {Array.from({ length: rows }, (_, index) =>
        variant === 'order' ? <OrderCardSkeleton key={index} /> : <RowSkeleton key={index} />
      )}
    </View>
  );
}
