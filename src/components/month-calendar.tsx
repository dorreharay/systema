import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

export type CalendarViewMode = 'year' | 'month' | 'week';

const WEEKDAY_LABELS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Нд'];
const MONTH_LABELS = Array.from({ length: 12 }, (_, month) =>
  new Date(2000, month, 1).toLocaleDateString('uk-UA', { month: 'long' })
);

function isSameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function getMonthGridRows(monthDate: Date) {
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstWeekday = (new Date(year, month, 1).getDay() + 6) % 7;

  const cells: (Date | null)[] = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => new Date(year, month, i + 1)),
  ];
  while (cells.length % 7 !== 0) {
    cells.push(null);
  }

  const rows: (Date | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) {
    rows.push(cells.slice(i, i + 7));
  }
  return rows;
}

function getWeekRowForDate(date: Date) {
  const rows = getMonthGridRows(new Date(date.getFullYear(), date.getMonth(), 1));
  return rows.find((row) => row.some((day) => day && isSameDay(day, date))) ?? [];
}

type MonthCalendarProps = {
  selectedDate: Date;
  onSelectDate: (date: Date) => void;
  viewMode: CalendarViewMode;
  onViewModeChange: (mode: CalendarViewMode) => void;
};

export default function MonthCalendar({
  selectedDate,
  onSelectDate,
  viewMode,
  onViewModeChange,
}: MonthCalendarProps) {
  const [visibleMonth, setVisibleMonth] = useState(
    () => new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1)
  );
  const [syncedSelectedDate, setSyncedSelectedDate] = useState(selectedDate);
  if (selectedDate !== syncedSelectedDate) {
    setSyncedSelectedDate(selectedDate);
    const selectedMonth = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1);
    if (selectedMonth.getTime() !== visibleMonth.getTime()) {
      setVisibleMonth(selectedMonth);
    }
  }
  const today = new Date();

  const goPrev = () => {
    if (viewMode === 'year') {
      setVisibleMonth((month) => new Date(month.getFullYear() - 1, month.getMonth(), 1));
    } else if (viewMode === 'month') {
      setVisibleMonth((month) => new Date(month.getFullYear(), month.getMonth() - 1, 1));
    }
  };
  const goNext = () => {
    if (viewMode === 'year') {
      setVisibleMonth((month) => new Date(month.getFullYear() + 1, month.getMonth(), 1));
    } else if (viewMode === 'month') {
      setVisibleMonth((month) => new Date(month.getFullYear(), month.getMonth() + 1, 1));
    }
  };

  const headerLabel =
    viewMode === 'year'
      ? `${visibleMonth.getFullYear()}`
      : viewMode === 'week'
        ? selectedDate.toLocaleDateString('uk-UA', {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
          })
        : visibleMonth.toLocaleDateString('uk-UA', { month: 'long', year: 'numeric' });

  const dayCell = (date: Date | null, key: string) => {
    if (!date) {
      return <View key={key} className="aspect-square flex-1" />;
    }
    const selected = isSameDay(date, selectedDate);
    const isToday = isSameDay(date, today);
    return (
      <Pressable
        key={key}
        onPress={() => onSelectDate(date)}
        className="aspect-square flex-1 cursor-pointer items-center justify-center">
        <View
          className={`h-full w-full items-center justify-center rounded-full ${
            selected ? 'bg-[#3C8D7A]' : isToday ? 'bg-[#38809822]' : ''
          }`}>
          <Text
            className={`font-sans text-sm ${selected ? 'font-medium text-white' : 'text-[#000000]'}`}>
            {date.getDate()}
          </Text>
        </View>
      </Pressable>
    );
  };

  return (
    <View className="gap-3">
      <View className="flex-row items-center justify-between px-1">
        <Pressable
          onPress={goPrev}
          hitSlop={8}
          className={`cursor-pointer ${viewMode === 'week' ? 'opacity-0' : ''}`}>
          <ChevronLeft size={16} color="#636976" />
        </Pressable>
        <Text className="font-sans text-base font-semibold capitalize text-[#000000]">
          {headerLabel}
        </Text>
        <Pressable
          onPress={goNext}
          hitSlop={8}
          className={`cursor-pointer ${viewMode === 'week' ? 'opacity-0' : ''}`}>
          <ChevronRight size={16} color="#636976" />
        </Pressable>
      </View>

      {viewMode === 'year' ? (
        <View className="flex-row flex-wrap gap-2">
          {MONTH_LABELS.map((label, month) => {
            const active =
              visibleMonth.getFullYear() === selectedDate.getFullYear() &&
              month === selectedDate.getMonth();
            return (
              <Pressable
                key={label}
                onPress={() => {
                  setVisibleMonth(new Date(visibleMonth.getFullYear(), month, 1));
                  onViewModeChange('month');
                }}
                className={`w-[31%] cursor-pointer items-center rounded-lg py-3 ${
                  active ? 'bg-[#38809822]' : 'hover:bg-[#F1F4F5]'
                }`}>
                <Text className="font-sans text-sm capitalize text-[#000000]">{label}</Text>
              </Pressable>
            );
          })}
        </View>
      ) : (
        <>
          <View className="flex-row">
            {WEEKDAY_LABELS.map((label) => (
              <View key={label} className="flex-1 items-center py-1">
                <Text className="font-sans text-xs text-secondary">{label}</Text>
              </View>
            ))}
          </View>

          <View className="gap-1">
            {(viewMode === 'week'
              ? [getWeekRowForDate(selectedDate)]
              : getMonthGridRows(visibleMonth)
            ).map((row, rowIndex) => (
              <View key={rowIndex} className="flex-row gap-1">
                {row.map((date, cellIndex) => dayCell(date, `${rowIndex}-${cellIndex}`))}
              </View>
            ))}
          </View>
        </>
      )}
    </View>
  );
}
