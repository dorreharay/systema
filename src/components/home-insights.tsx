import { useRouter } from 'expo-router';
import {
  CalendarDays,
  ChartColumn,
  Check,
  TrendingDown,
  TrendingUp,
  TriangleAlert,
  Wallet,
  type LucideIcon,
} from 'lucide-react-native';
import { useState, type ReactNode } from 'react';
import { PixelRatio, Pressable, View } from 'react-native';
import Animated, {
  interpolateColor,
  useAnimatedRef,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated';

import { BarChart, type ChartBar } from '@/components/ui/bar-chart';
import { BLOCK_ROOM } from '@/components/ui/card';
import { colors } from '@/components/ui/colors';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/states';
import { Text } from '@/components/ui/text';
import { useAuth } from '@/lib/auth';
import { MONTHS_LONG, WEEKDAYS_SHORT, formatMoneyWhole, parseIso, weekdayOf } from '@/lib/format';
import { useI18n } from '@/lib/i18n';
import { useInsights } from '@/lib/queries';
import type { ClientTotal, Insights } from '@/lib/types';

// The bars of the days that are done are in the brand colour; the days of the week ahead that are not today are in a
// softer one of it, so that today stands out.
const BAR_SOFT = '#a9b9b3';
const DOT_OFF = '#c2c8d0';

// --- The slider ------------------------------------------------------------------------------

type Slide = { key: string; title: string; content: ReactNode };

type DotProps = {
  index: number;
  title: string;
  selected: boolean;
  // How far the cards move from one dot's to the next one's.
  interval: number;
  offset: SharedValue<number>;
  onPress: () => void;
};

// One dot under the cards: wide and dark while its card is the one in view, and it follows the finger while the
// cards move.
function Dot({ index, title, selected, interval, offset, onPress }: DotProps) {
  const style = useAnimatedStyle(() => {
    const distance = Math.min(Math.abs(offset.get() / Math.max(interval, 1) - index), 1);
    return {
      width: 6 + (1 - distance) * 12,
      backgroundColor: interpolateColor(distance, [0, 1], [colors.primary, DOT_OFF]),
    };
  });

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ selected }}
      // Taller to touch, not wider: the dots are close, and wider zones would take a touch from the one beside.
      hitSlop={{ top: 10, bottom: 10 }}
      onPress={onPress}
      className="px-1.5 py-2">
      <Animated.View className="h-1.5 rounded-full" style={style} />
    </Pressable>
  );
}

// Slides side by side, one view wide each, from edge to edge: a swipe moves from one to the next and stops on it, and a dot
// goes to its own.
function Pager({ slides }: { slides: Slide[] }) {
  const [width, setWidth] = useState(0);
  const [page, setPage] = useState(0);
  const scroller = useAnimatedRef<Animated.ScrollView>();
  const offset = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler((event) => {
    offset.set(event.contentOffset.x);
  });

  const goTo = (index: number) => {
    setPage(index);
    scroller.current?.scrollTo({ x: index * width, animated: true });
  };

  return (
    <View className="flex-1">
      <Animated.ScrollView
        ref={scroller}
        horizontal
        pagingEnabled
        bounces={false}
        overScrollMode="never"
        showsHorizontalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={onScroll}
        onMomentumScrollEnd={(event) => setPage(Math.round(event.nativeEvent.contentOffset.x / Math.max(width, 1)))}
        // A page is as wide as the view: the slides are measured from it.
        onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
        className="flex-1">
        {width > 0
          ? slides.map((slide) => (
              <View key={slide.key} className={BLOCK_ROOM} style={{ width }}>
                {slide.content}
              </View>
            ))
          : null}
      </Animated.ScrollView>
      <View className="flex-row justify-center pt-1">
        {slides.map((slide, index) => (
          <Dot
            key={slide.key}
            index={index}
            title={slide.title}
            selected={page === index}
            interval={width}
            offset={offset}
            onPress={() => goTo(index)}
          />
        ))}
      </View>
    </View>
  );
}

// --- What every slide is made of -------------------------------------------------------------

type FrameProps = { title: string; aside?: string; children: ReactNode };

// The room of a slide, in its card: its name, and what it is about on the right; the rest is the slide's.
function Frame({ title, aside, children }: FrameProps) {
  return (
    <View className="flex-1 gap-2">
      <View className="flex-row items-center justify-between gap-3">
        <Text accessibilityRole="header" className="shrink text-[15.4px] font-semibold" numberOfLines={1}>
          {title}
        </Text>
        {aside ? (
          <Text className="text-[14.3px] text-muted" numberOfLines={1}>
            {aside}
          </Text>
        ) : null}
      </View>
      {children}
    </View>
  );
}

// The big number of a slide, and what it counts.
function Figure({ value, caption }: { value: string; caption: string }) {
  return (
    <View className="flex-row items-baseline gap-2">
      <Text className="text-[28.6px] font-semibold text-primary" numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      <Text className="shrink text-[14.3px] text-muted" numberOfLines={2}>
        {caption}
      </Text>
    </View>
  );
}

function Hint({ icon: Icon, text }: { icon: LucideIcon; text: string }) {
  return (
    <View className="flex-1 items-center justify-center gap-2 px-4">
      <Icon size={26} color={colors.primary} />
      <Text className="text-center text-[15.4px] text-muted">{text}</Text>
    </View>
  );
}

// --- Slide 1: the month ----------------------------------------------------------------------

// What this month's takings are against the same days of last month.
function Delta({ total, previous }: { total: number; previous: number }) {
  const { t } = useI18n();

  if (previous <= 0) {
    return (
      <Text className="text-[14.3px] text-muted">
        {total > 0 ? t('insights_no_payments_last_month') : t('insights_no_payments_yet')}
      </Text>
    );
  }
  const percent = Math.round(((total - previous) / previous) * 100);
  if (percent === 0) return <Text className="text-[14.3px] text-muted">{t('insights_same_as_last_month')}</Text>;

  const up = percent > 0;
  const Icon = up ? TrendingUp : TrendingDown;
  const tone = up ? colors.primary : colors.dangerInk;
  return (
    <View className="flex-row items-center gap-1.5">
      <Icon size={16} color={tone} />
      <Text className="text-[14.3px] font-semibold" style={{ color: tone }}>
        {up ? '+' : '−'}
        {Math.abs(percent)}%
      </Text>
      <Text className="shrink text-[14.3px] text-muted" numberOfLines={1}>
        {t('insights_vs_last_month')}
      </Text>
    </View>
  );
}

// The days of the month that carry a number under the bars.
const MONTH_TICKS = [1, 8, 15, 22, 29];

function MonthSlide({ data, today }: { data: Insights['revenue']; today: string }) {
  const { user } = useAuth();
  const { t, language } = useI18n();
  const length = data.days.length;
  const bars: ChartBar[] = data.days.map((day) => ({
    key: day.date,
    value: day.total,
    // A day that has not come yet is a faint stub; one that has, and brought nothing, a stub you can see.
    color: day.date > today ? colors.surface : day.total > 0 ? colors.primary : colors.line,
  }));
  // Nothing paid this month or last: there is nothing to compare or to draw yet.
  const nothing = data.total === 0 && data.previous_total === 0;

  return (
    <Frame title={t('insights_month')} aside={MONTHS_LONG[language][parseIso(today).month - 1]}>
      <Figure
        value={formatMoneyWhole(data.total, user?.currency ?? 'USD', language)}
        caption={t('insights_received')}
      />
      {nothing ? (
        <Hint icon={ChartColumn} text={t('insights_no_payments_yet')} />
      ) : (
        <>
          <Delta total={data.total} previous={data.previous_total} />
          <View className="mt-2 flex-1 gap-1.5">
            <BarChart bars={bars} gap={3} radius={3} />
            <View className="h-4">
              {MONTH_TICKS.filter((day) => day <= length).map((day) => (
                <Text
                  key={day}
                  className="absolute text-[13.2px] text-muted"
                  // Under the middle of its bar.
                  style={{ left: `${((day - 0.5) / length) * 100}%`, transform: [{ translateX: '-50%' }] }}>
                  {day}
                </Text>
              ))}
            </View>
          </View>
        </>
      )}
    </Frame>
  );
}

// --- Slide 2: the week ahead -----------------------------------------------------------------

const WEEK_GAP = 8;

function WeekSlide({ data, today }: { data: Insights['workload']; today: string }) {
  const { t, language } = useI18n();
  const due = data.days.reduce((sum, day) => sum + day.count, 0);
  const bars: ChartBar[] = data.days.map((day) => ({
    key: day.date,
    value: day.count,
    color: day.date === today ? colors.primary : BAR_SOFT,
    label:
      day.count > 0 ? (
        <Text
          className={`pb-1 text-[14.3px] font-semibold ${day.date === today ? 'text-ink' : 'text-muted'}`}
          maxFontSizeMultiplier={1.3}>
          {day.count}
        </Text>
      ) : undefined,
  }));

  return (
    <Frame title={t('insights_week')}>
      <Figure value={String(due)} caption={t('insights_week_due', { count: due })} />
      {data.overdue > 0 ? (
        <View
          className="flex-row items-center gap-1.5 self-start rounded-full px-3 py-1"
          style={{ backgroundColor: colors.dangerSoft }}>
          <TriangleAlert size={14} color={colors.dangerInk} />
          <Text className="text-[13.2px] font-semibold" style={{ color: colors.dangerInk }}>
            {t('insights_overdue', { count: data.overdue })}
          </Text>
        </View>
      ) : null}
      {due === 0 ? (
        <Hint icon={CalendarDays} text={t('insights_week_empty')} />
      ) : (
        <View className="mt-2 flex-1 gap-2">
          <BarChart bars={bars} gap={WEEK_GAP} maxBarWidth={30} labelRoom={26} radius={6} />
          {/* The same seven columns as the bars, so that each name stands under its own. */}
          <View className="flex-row" style={{ gap: WEEK_GAP }}>
            {data.days.map((day) => {
              const isToday = day.date === today;
              return (
                <View key={day.date} className="flex-1 items-center gap-0.5">
                  <Text className={`text-[13.2px] ${isToday ? 'font-semibold text-ink' : 'text-muted'}`}>
                    {WEEKDAYS_SHORT[language][weekdayOf(day.date)]}
                  </Text>
                  <View className={`size-6 items-center justify-center rounded-full ${isToday ? 'bg-primary' : ''}`}>
                    <Text className={`text-[13.2px] font-medium ${isToday ? 'text-white' : 'text-ink'}`}>
                      {parseIso(day.date).day}
                    </Text>
                  </View>
                </View>
              );
            })}
          </View>
        </View>
      )}
    </Frame>
  );
}

// --- Slide 3: who owes, and who pays ---------------------------------------------------------

// What the two lists are made of, to know how many rows fit: the heading, a row (a name over its amount), and the
// room between rows.
const LIST_HEADING = 26;
const LIST_ROW = 37;
const LIST_GAP = 10;
const LIST_MAX = 5;
// The text of the lists grows with the size the person set, but not beyond this: the rows that fit are counted with it.
const LIST_TEXT_SCALE = 1.3;

type ClientListProps = { title: string; empty: string; items: ClientTotal[]; rows: number; owed?: boolean };

function ClientList({ title, empty, items, rows, owed }: ClientListProps) {
  const { user } = useAuth();
  const { language } = useI18n();
  const router = useRouter();

  return (
    <View className="flex-1 gap-2.5">
      <Text
        className="text-[13.2px] font-medium text-muted"
        numberOfLines={1}
        maxFontSizeMultiplier={LIST_TEXT_SCALE}>
        {title}
      </Text>
      {items.length === 0 ? (
        <View className="flex-row items-center gap-1.5">
          {owed ? <Check size={16} color={colors.primary} /> : null}
          <Text className="shrink text-[14.3px] text-muted" maxFontSizeMultiplier={LIST_TEXT_SCALE}>
            {empty}
          </Text>
        </View>
      ) : (
        items.slice(0, rows).map((item) => (
          <Pressable
            key={item.client.id}
            accessibilityRole="button"
            onPress={() => router.push({ pathname: '/clients/[id]', params: { id: item.client.id } })}
            className="active:opacity-60">
            <Text className="text-[15.4px] font-medium" numberOfLines={1} maxFontSizeMultiplier={LIST_TEXT_SCALE}>
              {item.client.name}
            </Text>
            <Text className="text-[14.3px] text-muted" numberOfLines={1} maxFontSizeMultiplier={LIST_TEXT_SCALE}>
              {formatMoneyWhole(item.total, user?.currency ?? 'USD', language)}
            </Text>
          </Pressable>
        ))
      )}
    </View>
  );
}

function DebtsSlide({ data }: { data: Insights['receivables'] }) {
  const { user } = useAuth();
  const { t, language } = useI18n();
  const [room, setRoom] = useState(0);
  // As many rows as the height of the slide allows: a short screen shows fewer, and none is cut in half.
  const scale = Math.min(PixelRatio.getFontScale(), LIST_TEXT_SCALE);
  const rows = Math.max(
    1,
    Math.min(LIST_MAX, Math.floor((room - LIST_HEADING * scale + LIST_GAP) / (LIST_ROW * scale + LIST_GAP)))
  );

  return (
    <Frame title={t('insights_debts')}>
      <Figure
        value={formatMoneyWhole(data.unpaid_total, user?.currency ?? 'USD', language)}
        caption={t('insights_unpaid')}
      />
      {data.unpaid_orders > 0 ? (
        <Text className="text-[14.3px] text-muted">{t('insights_unpaid_orders', { count: data.unpaid_orders })}</Text>
      ) : null}
      {data.debtors.length === 0 && data.top_clients.length === 0 ? (
        <Hint icon={Wallet} text={t('insights_debts_empty')} />
      ) : (
        <View className="mt-2 flex-1" onLayout={(event) => setRoom(event.nativeEvent.layout.height)}>
          <View className="flex-row gap-4">
            <ClientList
              owed
              title={t('insights_debtors')}
              empty={t('insights_no_debts')}
              items={data.debtors}
              rows={rows}
            />
            <View className="w-px bg-line" />
            <ClientList
              title={t('insights_top_clients')}
              empty={t('insights_no_top_clients')}
              items={data.top_clients}
              rows={rows}
            />
          </View>
        </View>
      )}
    </Frame>
  );
}

// --- On the page -----------------------------------------------------------------------------

// The heights, as a share of the chart, of the bars that stand in for it while it loads.
const SKELETON_BARS = [38, 62, 48, 80, 30, 100, 56, 72, 42, 90, 60, 46];

function InsightsSkeleton() {
  return (
    <View className={`flex-1 gap-3 ${BLOCK_ROOM}`} accessibilityLabel="Loading">
      <Skeleton className="h-5 w-36" />
      <Skeleton className="h-8 w-32" />
      <Skeleton className="h-4 w-44" />
      <View className="mt-2 flex-1 flex-row items-end gap-1.5 pb-5">
        {SKELETON_BARS.map((share, index) => (
          <Skeleton key={index} className="flex-1" style={{ height: `${share}%` }} />
        ))}
      </View>
    </View>
  );
}

/**
 * What the home screen shows above its numbers, in cards you swipe through, one for each: how the month is going, how
 * busy the next week is, and who owes and who pays. The three come from one request.
 */
export default function HomeInsights() {
  const { t } = useI18n();
  const insights = useInsights();
  const data = insights.data;

  return (
    <View className="min-h-[280px] flex-1">
      {data ? (
        <Pager
          slides={[
            {
              key: 'month',
              title: t('insights_month'),
              content: <MonthSlide data={data.revenue} today={data.today} />,
            },
            {
              key: 'week',
              title: t('insights_week'),
              content: <WeekSlide data={data.workload} today={data.today} />,
            },
            {
              key: 'debts',
              title: t('insights_debts'),
              content: <DebtsSlide data={data.receivables} />,
            },
          ]}
        />
      ) : insights.isError ? (
        <View className="flex-1 justify-center">
          <ErrorState error={insights.error} onRetry={() => insights.refetch()} />
        </View>
      ) : (
        <InsightsSkeleton />
      )}
    </View>
  );
}
