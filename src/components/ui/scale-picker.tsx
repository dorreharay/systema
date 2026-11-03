import { useCallback, useEffect, useRef, useState } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';

import { SCALE_HEIGHT, ScaleRuler } from '@/components/ui/scale-ruler';
import { Text } from '@/components/ui/text';
import { formatNumber, parseDecimal } from '@/lib/format';
import { useI18n } from '@/lib/i18n';

type ScalePickerProps = {
  label?: string;
  // The count as the form keeps it: digits with a point.
  value: string;
  onChange: (value: string) => void;
  // The count between two ticks of the scale: 1 for what is counted one by one, 0.5 for halves.
  step?: number;
  unit?: string;
  error?: string;
  hint?: string;
};

// The scale is this long at least, and reaches past what is there when it starts, so there is room to add.
const MIN_SPAN = 100;

const spanFor = (value: number) => Math.max(MIN_SPAN, Math.ceil((value + MIN_SPAN / 2) / 10) * 10);

/**
 * A count to set by scrolling a scale under a mark, like a weight: the number is read above it. It never goes
 * below nothing, and the scale is a hundred long (longer when there is more than that to start with).
 */
export function ScalePicker({ label, value, onChange, step = 1, unit, error, hint }: ScalePickerProps) {
  const { t } = useI18n();
  const [width, setWidth] = useState(0);
  const current = parseDecimal(value) ?? 0;
  // The number read above the scale (it follows the scale at once) and where the scale was put when it was made.
  const [shown, setShown] = useState(current);
  const [start, setStart] = useState(current);
  const [revision, setRevision] = useState(0);

  // A count that is not the one shown was set by the form, not by the scale. The scale cannot be moved from
  // outside, so a new one is made, put where that count is.
  if (current !== shown) {
    setShown(current);
    setStart(current);
    setRevision(revision + 1);
  }

  // The scale is drawn again only when it is made anew, so the function it is given never changes, and the latest
  // `onChange` is called through a ref.
  const latest = useRef(onChange);
  useEffect(() => {
    latest.current = onChange;
  });
  const scrolled = useCallback(
    (tick: number) => {
      const next = tick * step;
      setShown(next);
      latest.current(formatNumber(next, 1));
    },
    [step]
  );

  const max = spanFor(start);
  const text = formatNumber(shown, 1);
  const nudge = (delta: number) => onChange(formatNumber(Math.min(max, Math.max(0, current + delta)), 1));

  return (
    <View className="gap-1.5">
      {label ? <Text className="text-[14.3px] font-medium text-muted">{label}</Text> : null}
      <View
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={label}
        accessibilityValue={{ text: unit ? `${text} ${unit}` : text }}
        accessibilityActions={[
          { name: 'increment', label: t('stock_increase') },
          { name: 'decrement', label: t('stock_decrease') },
        ]}
        onAccessibilityAction={(event) => {
          if (event.nativeEvent.actionName === 'increment') nudge(step);
          else if (event.nativeEvent.actionName === 'decrement') nudge(-step);
        }}
        className="pb-6 pt-4">
        <View
          style={{ height: SCALE_HEIGHT }}
          onLayout={(event: LayoutChangeEvent) => setWidth(Math.round(event.nativeEvent.layout.width))}>
          {width > 0 ? (
            <ScaleRuler
              key={revision}
              width={width}
              count={Math.round(max / step) + 1}
              start={Math.round(start / step)}
              onTick={scrolled}
            />
          ) : null}
          {/* Over the empty top of the scale, above the mark. */}
          <View
            pointerEvents="none"
            className="absolute inset-x-0 top-0 flex-row items-baseline justify-center gap-1.5 pt-1">
            <Text className="text-[32px] font-semibold" maxFontSizeMultiplier={1.2}>
              {text}
            </Text>
            {unit ? (
              <Text className="text-base text-muted" maxFontSizeMultiplier={1.2}>
                {unit}
              </Text>
            ) : null}
          </View>
        </View>
      </View>
      {error ? (
        <Text accessibilityRole="alert" className="text-xs text-danger">
          {error}
        </Text>
      ) : hint ? (
        <Text className="text-xs text-muted">{hint}</Text>
      ) : null}
    </View>
  );
}
