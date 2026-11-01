import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import AppButton from '@/components/ui/app-button';
import IconButton from '@/components/ui/icon-button';
import Sheet from '@/components/ui/sheet';
import { Text } from '@/components/ui/text';
import {
  MONTHS_LONG,
  WEEKDAYS_SHORT,
  addDays,
  daysInMonth,
  parseIso,
  toIso,
  weekdayOf,
} from '@/lib/format';
import { useI18n } from '@/lib/i18n';

type DateSheetProps = {
  visible: boolean;
  onClose: () => void;
  title: string;
  value: string | null;
  today: string;
  onChange: (value: string | null) => void;
  // Offers "no date": a due date is optional.
  clearable?: boolean;
};

function Calendar({
  value,
  today,
  onPick,
}: {
  value: string | null;
  today: string;
  onPick: (iso: string) => void;
}) {
  const { language, t } = useI18n();
  const start = parseIso(value ?? today);
  const [month, setMonth] = useState({ year: start.year, month: start.month });

  const shift = (delta: number) =>
    setMonth(({ year, month: current }) => {
      const index = year * 12 + (current - 1) + delta;
      return { year: Math.floor(index / 12), month: (index % 12) + 1 };
    });

  const offset = weekdayOf(toIso(month.year, month.month, 1));
  const cells: (number | null)[] = [
    ...Array.from({ length: offset }, () => null),
    ...Array.from({ length: daysInMonth(month.year, month.month) }, (_, index) => index + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <View className="gap-2">
      <View className="flex-row items-center justify-between">
        <IconButton icon={ChevronLeft} label={t('previous_month')} onPress={() => shift(-1)} />
        <Text accessibilityRole="header" className="text-base font-semibold">
          {MONTHS_LONG[language][month.month - 1]} {month.year}
        </Text>
        <IconButton icon={ChevronRight} label={t('next_month')} onPress={() => shift(1)} />
      </View>
      <View className="flex-row">
        {WEEKDAYS_SHORT[language].map((day) => (
          <View key={day} className="flex-1 items-center py-1">
            <Text className="text-xs font-medium text-muted">{day}</Text>
          </View>
        ))}
      </View>
      <View className="flex-row flex-wrap">
        {cells.map((day, index) => {
          if (day === null) {
            return <View key={index} className="h-11 w-[14.2857%]" />;
          }
          const iso = toIso(month.year, month.month, day);
          const selected = iso === value;
          return (
            <Pressable
              key={index}
              accessibilityRole="button"
              accessibilityLabel={iso}
              accessibilityState={{ selected }}
              onPress={() => onPick(iso)}
              className="h-11 w-[14.2857%] items-center justify-center">
              <View
                className={`size-10 items-center justify-center rounded-full ${
                  selected ? 'bg-primary' : iso === today ? 'border border-primary' : ''
                }`}>
                <Text
                  className={`text-[15px] ${
                    selected ? 'font-semibold text-white' : iso === today ? 'font-semibold text-primary' : ''
                  }`}>
                  {day}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/** Quick answers first (a stringer's deadlines are "tomorrow" or "in three days"), a calendar for the rest. */
export function DateSheet({ visible, onClose, title, value, today, onChange, clearable }: DateSheetProps) {
  const { t } = useI18n();
  const pick = (iso: string | null) => {
    onChange(iso);
    onClose();
  };
  const presets = [
    { label: t('date_today'), iso: today },
    { label: t('date_tomorrow'), iso: addDays(today, 1) },
    { label: t('date_in_days', { count: 3 }), iso: addDays(today, 3) },
    { label: t('date_in_week'), iso: addDays(today, 7) },
  ];

  return (
    <Sheet visible={visible} onClose={onClose} title={title}>
      <View className="gap-4 pt-2">
        <View className="flex-row flex-wrap gap-2">
          {presets.map((preset) => (
            <Pressable
              key={preset.label}
              accessibilityRole="button"
              onPress={() => pick(preset.iso)}
              className={`min-h-10 justify-center rounded-full border px-4 ${
                value === preset.iso ? 'border-primary bg-primary' : 'border-line bg-white active:bg-surface'
              }`}>
              <Text
                className={`text-[15px] font-medium ${value === preset.iso ? 'text-white' : 'text-ink'}`}>
                {preset.label}
              </Text>
            </Pressable>
          ))}
        </View>
        <Calendar value={value} today={today} onPick={pick} />
        {clearable && value ? (
          <AppButton title={t('date_clear')} variant="ghost" onPress={() => pick(null)} />
        ) : null}
      </View>
    </Sheet>
  );
}

type TimeSheetProps = {
  visible: boolean;
  onClose: () => void;
  value: string | null;
  onChange: (value: string | null) => void;
};

// Half-hour steps through a working day.
const TIMES = Array.from({ length: 29 }, (_, index) => {
  const minutes = 7 * 60 + index * 30;
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${minutes % 60 === 0 ? '00' : '30'}`;
});

export function TimeSheet({ visible, onClose, value, onChange }: TimeSheetProps) {
  const { t } = useI18n();
  const pick = (time: string | null) => {
    onChange(time);
    onClose();
  };

  return (
    <Sheet visible={visible} onClose={onClose} title={t('order_due_time')}>
      <View className="gap-4 pt-2">
        <View className="flex-row flex-wrap gap-2">
          {TIMES.map((time) => (
            <Pressable
              key={time}
              accessibilityRole="button"
              onPress={() => pick(time)}
              className={`min-h-11 min-w-[22%] flex-1 items-center justify-center rounded-xl border ${
                value === time ? 'border-primary bg-primary' : 'border-line bg-white active:bg-surface'
              }`}>
              <Text className={`text-[15px] font-medium ${value === time ? 'text-white' : 'text-ink'}`}>
                {time}
              </Text>
            </Pressable>
          ))}
        </View>
        {value ? <AppButton title={t('time_clear')} variant="ghost" onPress={() => pick(null)} /> : null}
      </View>
    </Sheet>
  );
}

