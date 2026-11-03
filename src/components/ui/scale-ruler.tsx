import { memo, useMemo, useRef } from 'react';
import {
  ScrollView,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ScrollViewInstance,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { colors } from '@/components/ui/colors';

// A scale to scroll under a mark: ticks a few points apart, every tenth one longer. All the ticks are two paths of one
// drawing, so a hundred of them cost no more to show than ten, and a scroll view that stops on a tick moves it. (A view
// for each tick, from a list, made every sheet that had a scale slow to come up.)

const TICK_WIDTH = 2;
const TICK_GAP = 10;
const PITCH = TICK_WIDTH + TICK_GAP;
const SHORT_HEIGHT = 14;
const LONG_HEIGHT = 32;
const LONG_EVERY = 10;
const SHORT_COLOR = '#d0d5dd';
// The ticks stand on the foot of the scale, and the mark rises from it above the long ones.
const NEEDLE_HEIGHT = 40;
export const SCALE_HEIGHT = 84;

type ScaleRulerProps = {
  // Of the box it is in: the mark is in the middle of it.
  width: number;
  // How many ticks there are.
  count: number;
  // The tick that is under the mark at first.
  start: number;
  // Told each time another tick comes under the mark.
  onTick: (tick: number) => void;
};

/** The ticks of one kind, the long or the short, as the rectangles of one path. */
function tickPath(count: number, long: boolean) {
  const height = long ? LONG_HEIGHT : SHORT_HEIGHT;
  let path = '';
  for (let tick = 0; tick < count; tick += 1) {
    if ((tick % LONG_EVERY === 0) !== long) continue;
    path += `M${tick * PITCH} ${LONG_HEIGHT - height}h${TICK_WIDTH}v${height}h${-TICK_WIDTH}z`;
  }
  return path;
}

export const ScaleRuler = memo(function ScaleRuler({ width, count, start, onTick }: ScaleRulerProps) {
  const scroll = useRef<ScrollViewInstance>(null);
  const placed = useRef(false);
  const last = useRef(start);
  const shortTicks = useMemo(() => tickPath(count, false), [count]);
  const longTicks = useMemo(() => tickPath(count, true), [count]);

  const tickAt = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const tick = Math.min(count - 1, Math.max(0, Math.round(event.nativeEvent.contentOffset.x / PITCH)));
    if (tick === last.current) return;
    last.current = tick;
    onTick(tick);
  };

  return (
    <View style={{ width, height: SCALE_HEIGHT }}>
      <ScrollView
        ref={scroll}
        horizontal
        showsHorizontalScrollIndicator={false}
        overScrollMode="never"
        decelerationRate="fast"
        snapToInterval={PITCH}
        scrollEventThrottle={16}
        contentOffset={{ x: start * PITCH, y: 0 }}
        // Where the platform does not take the starting offset, the scroll view is moved there once it has its size.
        onContentSizeChange={() => {
          if (placed.current) return;
          placed.current = true;
          scroll.current?.scrollTo({ x: start * PITCH, animated: false });
        }}
        onScroll={tickAt}
        onScrollEndDrag={tickAt}
        onMomentumScrollEnd={tickAt}
        // The first tick is under the mark with the scroll view at its start, and so is the last one at its end.
        contentContainerStyle={{ paddingHorizontal: (width - TICK_WIDTH) / 2 }}>
        <Svg width={(count - 1) * PITCH + TICK_WIDTH} height={LONG_HEIGHT} style={{ alignSelf: 'flex-end' }}>
          <Path d={shortTicks} fill={SHORT_COLOR} />
          <Path d={longTicks} fill={colors.placeholder} />
        </Svg>
      </ScrollView>
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          bottom: 0,
          left: (width - TICK_WIDTH) / 2,
          width: TICK_WIDTH,
          height: NEEDLE_HEIGHT,
          backgroundColor: colors.primary,
        }}
      />
    </View>
  );
});
