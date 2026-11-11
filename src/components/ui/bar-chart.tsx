import { useState, type ReactNode } from 'react';
import { View } from 'react-native';

export type ChartBar = {
  key: string;
  value: number;
  color: string;
  // Stands right above the bar, however tall it is (a count).
  label?: ReactNode;
};

type BarChartProps = {
  bars: ChartBar[];
  // The room between two bars.
  gap?: number;
  // A bar is as wide as the room it has, up to this.
  maxBarWidth?: number;
  // How tall a bar with nothing in it is: a stub, so that its place on the axis is still marked.
  stub?: number;
  // The room above the tallest bar that a label needs.
  labelRoom?: number;
  // The rounding of the top of a bar.
  radius?: number;
  // The rounding of the foot of a bar: a little for a thin bar, nearly as much as the top for a soft one.
  bottomRadius?: number;
};

// Bars standing on one line, as tall as their value is against the largest one: the chart fills whatever height it
// is given. The bars are laid over it, not in it, so that they never ask for height of their own.
export function BarChart({
  bars,
  gap = 3,
  maxBarWidth,
  stub = 3,
  labelRoom = 0,
  radius = 4,
  bottomRadius = 1.5,
}: BarChartProps) {
  const [height, setHeight] = useState(0);
  const largest = Math.max(0, ...bars.map((bar) => bar.value));
  const room = Math.max(0, height - labelRoom);

  return (
    <View className="flex-1" onLayout={(event) => setHeight(event.nativeEvent.layout.height)}>
      <View className="absolute inset-0 flex-row items-end" style={{ gap }}>
        {height > 0
          ? bars.map((bar) => {
              const tall = bar.value > 0 && largest > 0 ? Math.max(stub + 2, (bar.value / largest) * room) : stub;
              const round = Math.min(radius, tall / 2);
              return (
                <View key={bar.key} className="flex-1 items-center justify-end">
                  {bar.label}
                  <View
                    style={{
                      width: '100%',
                      maxWidth: maxBarWidth,
                      height: tall,
                      backgroundColor: bar.color,
                      borderTopLeftRadius: round,
                      borderTopRightRadius: round,
                      borderBottomLeftRadius: Math.min(bottomRadius, round),
                      borderBottomRightRadius: Math.min(bottomRadius, round),
                    }}
                  />
                </View>
              );
            })
          : null}
      </View>
    </View>
  );
}
