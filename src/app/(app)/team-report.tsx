import { useState } from 'react';
import { View } from 'react-native';

import { ChevronLeft, ChevronRight, Lock, WifiOff } from '@/components/icons';
import { PersonBadge } from '@/components/person-badge';
import Card, { BLOCK, BLOCK_ROOM } from '@/components/ui/card';
import { colors } from '@/components/ui/colors';
import IconButton from '@/components/ui/icon-button';
import { DetailHeader, DetailScroll, Screen } from '@/components/ui/screen';
import { BlockSkeleton } from '@/components/ui/skeleton';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { Text } from '@/components/ui/text';
import { useAuth } from '@/lib/auth';
import { formatMoney, formatMoneyWhole, formatMonthYear, formatNumber, todayIso } from '@/lib/format';
import { useI18n, type TKey } from '@/lib/i18n';
import { useIsWide } from '@/lib/layout';
import { useOnline } from '@/lib/queries';
import { isOffline } from '@/lib/errors';
import { useTeamReport, type ReportLine } from '@/lib/team-api';
import { useSelf, useWorkshop } from '@/lib/use-workshop';

// The month by person (GET /api/team/report): the orders made, what was paid and the time from "in progress" to "ready". The owner sees
// everyone, the orders nobody had, and the total; a master sees their own line. It is the server's: it needs a connection.

const ROLE_LABEL: Record<string, TKey> = { owner: 'role_owner', master: 'role_master', receptionist: 'role_receptionist' };

/** The month `delta` months from `month` (`YYYY-MM`). */
function shiftMonth(month: string, delta: number) {
  const [year, number] = month.split('-').map(Number);
  const index = year * 12 + (number - 1) + delta;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`;
}

// A wide page sets the lines in columns; the widths are shared by the header and every line, so that the figures stand under their names.
const COLUMN = { orders: 'w-20 items-end', revenue: 'w-32 items-end', hours: 'w-28 items-end', share: 'w-44' } as const;

function Share({ share }: { share: number | null }) {
  const percent = share === null ? null : Math.round(share * 100);
  return (
    <View className="flex-row items-center gap-2.5">
      <View className="h-1.5 flex-1 overflow-hidden rounded-full" style={{ backgroundColor: colors.surface }}>
        <View className="h-full rounded-full" style={{ width: `${percent ?? 0}%`, backgroundColor: colors.primary }} />
      </View>
      <Text className="w-10 text-right text-[13.5px] text-muted">{percent === null ? '-' : `${percent}%`}</Text>
    </View>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View className="min-w-0 flex-1 gap-0.5">
      <Text className="text-[13px] text-muted" numberOfLines={1}>
        {label}
      </Text>
      <Text className="text-[16px] font-semibold" numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

export default function TeamReportPage() {
  const { t, language } = useI18n();
  const { user } = useAuth();
  const { role, canSeeReport } = useWorkshop();
  const self = useSelf();
  const wide = useIsWide();
  const online = useOnline();

  const current = todayIso(user?.timezone).slice(0, 7);
  const [month, setMonth] = useState(current);
  const report = useTeamReport(month, canSeeReport);
  const data = report.data;

  const [year, number] = month.split('-').map(Number);
  const title = role === 'master' ? t('report_title_mine') : t('report_title');

  const currency = data?.currency ?? user?.currency ?? 'USD';
  const money = (amount: number) =>
    Number.isInteger(amount) ? formatMoneyWhole(amount, currency, language) : formatMoney(amount, currency, language);
  const hours = (value: number | null) => (value === null ? '-' : t('report_hours', { hours: formatNumber(value, 1) }));
  const nameOf = (line: ReportLine) =>
    !line.person ? t('queue_none') : line.person.id === self?.id ? t('queue_you') : (line.person.name ?? '-');
  const roleOf = (line: ReportLine) => (line.person?.role ? t(ROLE_LABEL[line.person.role]) : undefined);

  const monthBar = (
    <View className="flex-row items-center justify-between">
      <IconButton icon={ChevronLeft} label={t('report_month_previous')} onPress={() => setMonth(shiftMonth(month, -1))} />
      <Text accessibilityRole="header" className="text-[17px] font-semibold">
        {formatMonthYear(number, year, language)}
      </Text>
      <IconButton
        icon={ChevronRight}
        label={t('report_month_next')}
        disabled={month >= current}
        onPress={() => setMonth(shiftMonth(month, 1))}
      />
    </View>
  );

  const body = !canSeeReport ? (
    <EmptyState icon={Lock} title={t('queue_error_role')} />
  ) : data ? (
    <>
      {wide ? (
        <View className={`${BLOCK} overflow-hidden`}>
          <View className="h-11 flex-row items-center gap-4 border-b border-line px-5">
            <Text className="min-w-0 flex-1 text-[12px] font-semibold uppercase tracking-[0.06em] text-muted">
              {t('report_person')}
            </Text>
            <View className={COLUMN.orders}>
              <Text className="text-[12px] font-semibold uppercase tracking-[0.06em] text-muted">{t('report_orders')}</Text>
            </View>
            <View className={COLUMN.revenue}>
              <Text className="text-[12px] font-semibold uppercase tracking-[0.06em] text-muted">{t('report_revenue')}</Text>
            </View>
            <View className={COLUMN.hours}>
              <Text className="text-[12px] font-semibold uppercase tracking-[0.06em] text-muted">{t('report_avg_time')}</Text>
            </View>
            <View className={COLUMN.share}>
              <Text className="text-[12px] font-semibold uppercase tracking-[0.06em] text-muted">{t('report_share')}</Text>
            </View>
          </View>
          {data.rows.map((line) => (
            <View key={line.person?.id ?? 'none'} className="min-h-16 flex-row items-center gap-4 border-b border-line/50 px-5 py-2">
              <View className="min-w-0 flex-1 flex-row items-center gap-3">
                <PersonBadge person={line.person ? { id: line.person.id, name: line.person.name ?? '' } : null} size={36} />
                <View className="min-w-0 shrink">
                  <Text className="text-[15.5px] font-medium" numberOfLines={1}>
                    {nameOf(line)}
                  </Text>
                  {roleOf(line) ? (
                    <Text className="text-[13px] text-muted" numberOfLines={1}>
                      {roleOf(line)}
                    </Text>
                  ) : null}
                </View>
              </View>
              <View className={COLUMN.orders}>
                <Text className="text-[15px]">{line.orders}</Text>
              </View>
              <View className={COLUMN.revenue}>
                <Text className="text-[15px] font-semibold">{money(line.revenue)}</Text>
              </View>
              <View className={COLUMN.hours}>
                <Text className="text-[15px]">{hours(line.avg_hours)}</Text>
              </View>
              <View className={COLUMN.share}>
                <Share share={line.share} />
              </View>
            </View>
          ))}
          {data.totals ? (
            <View className="min-h-14 flex-row items-center gap-4 px-5 py-2">
              <Text className="min-w-0 flex-1 text-[15.5px] font-semibold">{t('report_total')}</Text>
              <View className={COLUMN.orders}>
                <Text className="text-[15px] font-semibold">{data.totals.orders}</Text>
              </View>
              <View className={COLUMN.revenue}>
                <Text className="text-[15px] font-semibold">{money(data.totals.revenue)}</Text>
              </View>
              <View className={COLUMN.hours} />
              <View className={COLUMN.share} />
            </View>
          ) : null}
        </View>
      ) : (
        <View className="gap-1">
          {data.rows.map((line) => (
            <Card key={line.person?.id ?? 'none'} className="gap-3">
              <View className="flex-row items-center gap-3">
                <PersonBadge person={line.person ? { id: line.person.id, name: line.person.name ?? '' } : null} size={36} />
                <View className="min-w-0 flex-1">
                  <Text className="text-[16.5px] font-semibold" numberOfLines={1}>
                    {nameOf(line)}
                  </Text>
                  {roleOf(line) ? (
                    <Text className="text-[13.5px] text-muted" numberOfLines={1}>
                      {roleOf(line)}
                    </Text>
                  ) : null}
                </View>
                <Text className="text-[18px] font-semibold">{money(line.revenue)}</Text>
              </View>
              <View className="flex-row gap-3">
                <Metric label={t('report_orders')} value={String(line.orders)} />
                <Metric label={t('report_avg_time')} value={hours(line.avg_hours)} />
              </View>
              <View className="gap-1">
                <Text className="text-[13px] text-muted">{t('report_share')}</Text>
                <Share share={line.share} />
              </View>
            </Card>
          ))}
          {data.totals ? (
            <View className={`${BLOCK} ${BLOCK_ROOM} flex-row items-center justify-between gap-3`}>
              <View className="min-w-0 flex-1">
                <Text className="text-[16.5px] font-semibold">{t('report_total')}</Text>
                <Text className="text-[13.5px] text-muted">{`${t('report_orders')}: ${data.totals.orders}`}</Text>
              </View>
              <Text className="text-[22px] font-semibold text-primary">{money(data.totals.revenue)}</Text>
            </View>
          ) : null}
        </View>
      )}
      <Text className="px-1 text-[13.5px] leading-[18px] text-muted">{t('report_note')}</Text>
    </>
  ) : report.isError && !isOffline(report.error) && online ? (
    <ErrorState error={report.error} onRetry={() => void report.refetch()} />
  ) : report.fetchStatus === 'paused' || report.isError ? (
    // No connection (the request waits for one, or has failed for want of it): the report is the server's and cannot be had without it.
    <EmptyState icon={WifiOff} title={t('report_offline')} message={t('report_offline_hint')} />
  ) : (
    <View className="gap-1">
      <BlockSkeleton className="h-28" />
      <BlockSkeleton className="h-28" />
    </View>
  );

  return (
    <Screen flush width="medium">
      <DetailHeader floating title={title} />
      <DetailScroll contentContainerClassName="gap-4 p-page pb-12" showsVerticalScrollIndicator={false}>
        {canSeeReport ? monthBar : null}
        {body}
      </DetailScroll>
    </Screen>
  );
}
