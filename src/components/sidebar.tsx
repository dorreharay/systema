import { usePathname, useRouter, type Href } from 'expo-router';
import type { ComponentType } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import CatalogIcon from '@/components/icons/catalog-icon';
import HomeIcon from '@/components/icons/home-icon';
import ListIcon from '@/components/icons/list-icon';
import PlusIcon from '@/components/icons/plus-icon';
import SettingsIcon from '@/components/icons/settings-icon';
import TeamIcon from '@/components/icons/team-icon';
import UserIcon from '@/components/icons/user-icon';
import Grain from '@/components/grain';
import { BUTTON_RADIUS } from '@/components/ui/button-radius';
import { colors } from '@/components/ui/colors';
import Shortcut from '@/components/ui/shortcut';
import { Text } from '@/components/ui/text';
import { useAuth } from '@/lib/auth';
import { useI18n, type TKey } from '@/lib/i18n';
import { SIDEBAR_LOGO_SLOT, SIDEBAR_WIDTH, type LayoutMode } from '@/lib/layout';
import { useSyncSummary } from '@/lib/offline/react';
import { useDashboard } from '@/lib/queries';
import { usePlanName } from '@/lib/use-subscription';
import { useWorkshop } from '@/lib/use-workshop';

const NAV_ICON = 22;

type Place = {
  key: string;
  href: Href;
  icon: ComponentType<{ size?: number; color?: string }>;
  label: TKey;
  // Whether the page at this path belongs to this place: an order is in Orders, a racket in Stock.
  owns: (path: string) => boolean;
};

const under = (path: string, base: string) => path === base || path.startsWith(`${base}/`);

// The places of the sidebar: the home, and the three that the phone reaches from its bar or from the home screen. (The settings are not
// among them: they are the wheel at the foot of the sidebar, beside who is signed in.)
const PLACES: Place[] = [
  { key: 'home', href: '/home', icon: HomeIcon, label: 'tab_home', owns: (path) => path === '/home' },
  { key: 'orders', href: '/orders', icon: ListIcon, label: 'tab_orders', owns: (path) => under(path, '/orders') },
  { key: 'clients', href: '/clients', icon: UserIcon, label: 'tab_clients', owns: (path) => under(path, '/clients') },
  {
    key: 'catalog',
    href: '/catalog',
    icon: CatalogIcon,
    label: 'tab_catalog',
    owns: (path) => under(path, '/catalog') || under(path, '/rackets'),
  },
];

// The people of a Studio workshop: a place of the sidebar only for the owner of one and for those who work in it, and only where Studio
// exists. (The page that takes the code of an invitation is a page of the same place.)
const TEAM_PLACE: Place = {
  key: 'team',
  href: '/team',
  icon: TeamIcon,
  label: 'team_title',
  owns: (path) => under(path, '/team') || under(path, '/join'),
};

// The focus ring on the dark ground is white, not green (web-styles.web.ts reads `data-on-dark`), and the dark has a soft green light
// at its foot (`data-sidebar`, there too). `dataSet` is react-native-web's, so it goes in as a spread: React Native's own types do not
// have it.
const SIDEBAR_DATA = { dataSet: { onDark: 'true', sidebar: 'true' } };

// The light of the dot that says how the sync stands: green when everything is sent, blue while it is being sent, yellow while
// something waits or there is no connection, red when the server refused something.
const SYNC_DOT = {
  synced: '#86DCAE',
  syncing: '#9CC5E7',
  waiting: '#F3D590',
  offline: '#F3D590',
  failed: '#F4A39B',
} as const;

/**
 * How the phone and the server stand, always in view at the foot of the sidebar (the little mark in the headers is for the phone).
 * A press opens the queue.
 */
function SyncCard() {
  const { t } = useI18n();
  const router = useRouter();
  const sync = useSyncSummary();
  const state =
    sync.failed > 0
      ? 'failed'
      : !sync.online
        ? 'offline'
        : sync.unsynced > 0
          ? 'waiting'
          : sync.syncing
            ? 'syncing'
            : 'synced';
  const text = {
    synced: t('sync_status_synced'),
    syncing: t('sync_status_syncing'),
    offline: t('sync_status_offline'),
    waiting: t('sync_status_waiting', { count: sync.unsynced }),
    failed: t('sync_status_failed', { count: sync.failed }),
  }[state];
  const dot = SYNC_DOT[state];

  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={text}
      onPress={() => router.push('/sync')}
      className="flex-row items-center gap-2.5 rounded-2xl border border-white/10 bg-white/5 px-3.5 py-3 hover:bg-white/10 active:bg-white/15">
      <View
        className="size-2 rounded-full"
        style={{ backgroundColor: dot, boxShadow: `0 0 0 4px ${dot}29, 0 0 12px ${dot}CC` }}
      />
      <Text className="min-w-0 flex-1 text-[13px] leading-[17px] text-white/80" numberOfLines={2}>
        {text}
      </Text>
    </Pressable>
  );
}

/**
 * Who is signed in, under the sync, and at the right of it the wheel of the settings: the settings are not a place of the navigation
 * (they are not where a stringer works), and the wheel is lit, as a place is, while they are open.
 */
function Profile() {
  const { user } = useAuth();
  const { t } = useI18n();
  const router = useRouter();
  const path = usePathname();
  const planName = usePlanName();
  const name = user?.full_name?.trim().split(/\s+/)[0] || user?.email.split('@')[0] || '';
  // The queue of the sync is a page of the settings.
  const active = under(path, '/settings') || path === '/sync';

  return (
    <View className="flex-row items-center gap-2.5 pl-1.5">
      <View className="size-[34px] items-center justify-center rounded-full" style={{ backgroundColor: colors.catalog }}>
        <Text className="text-[14px] font-semibold text-primary">{name.charAt(0).toUpperCase()}</Text>
      </View>
      <View className="min-w-0 flex-1">
        <Text className="text-[14px] font-medium text-white" numberOfLines={1}>
          {name}
        </Text>
        {/* The plan of the account, where the server has plans on. */}
        {planName ? (
          <Text className="text-[12.5px] leading-4 text-white/60" numberOfLines={1}>
            {t(planName === 'studio' ? 'plan_studio' : planName === 'pro' ? 'plan_pro' : 'plan_free')}
          </Text>
        ) : null}
      </View>
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={t('tab_settings')}
        {...(active ? { 'aria-current': 'page' } : null)}
        onPress={() => router.navigate('/settings')}
        className={`size-9 items-center justify-center ${BUTTON_RADIUS.full36} ${
          active ? 'bg-chrome-pill' : 'hover:bg-white/10 active:bg-white/15'
        }`}>
        <SettingsIcon size={20} color={active ? colors.chrome : colors.white} />
      </Pressable>
    </View>
  );
}

/**
 * The navigation of a wide page: a dark column at the left, on the same dark ground as the phone's navigation, with a soft green light
 * at its foot and a faint grain over it, with the same places in it (and the two that the phone reaches from the home screen), the
 * place you are in on a light pill, and on the Orders the number of those that are not finished. It is on every page of the signed-in
 * app, so it does not move when the pages do. It adds the button of the new order, the thing a stringer does most, which is always in
 * reach here, and at its foot how the sync stands, who is signed in, and the wheel of the settings.
 */
export default function Sidebar({ mode }: { mode: Exclude<LayoutMode, 'phone'> }) {
  const { t } = useI18n();
  const router = useRouter();
  const path = usePathname();
  const { user } = useAuth();
  const planName = usePlanName();
  const open = useDashboard().data?.active_orders ?? 0;
  // Studio exists at this server, and this person holds it or works in a workshop that does (or did: a paused team is still theirs).
  const workshop = user?.workshop;
  const studio = user?.subscription?.studio_available === true;
  const places = studio && (planName === 'studio' || workshop?.member === true || workshop?.team === true) ? [...PLACES, TEAM_PLACE] : PLACES;
  // A member of a paused workshop reads and does not write: no new order.
  const { canWrite } = useWorkshop();

  return (
    <View
      role="navigation"
      accessibilityLabel="re:string"
      {...(SIDEBAR_DATA as object)}
      className="overflow-hidden"
      style={{ width: SIDEBAR_WIDTH[mode], backgroundColor: colors.chrome }}>
      <Grain opacity={0.16} />
      <ScrollView
        showsVerticalScrollIndicator={false}
        bounces={false}
        overScrollMode="never"
        contentContainerClassName="grow gap-1 px-4 pb-4">
        {/* The brand. The logo of the intro lands on it. */}
        <View
          className="items-center justify-center"
          style={{ height: SIDEBAR_LOGO_SLOT.top * 2 + SIDEBAR_LOGO_SLOT.height }}>
          <Text
            accessibilityRole="header"
            className="text-[24px] tracking-[-1px] text-white"
            style={{ fontFamily: 'FixelStylistic-Bold' }}
            numberOfLines={1}>
            re:string
          </Text>
        </View>

        <View className="pb-4">
          {/* On a tablet the sidebar is narrower: the button is the smaller one, so that "Nouvelle commande" fits. */}
          {canWrite ? (
            <Shortcut
              compact={mode === 'desktop'}
              dense={mode === 'tablet'}
              icon={PlusIcon}
              label={t('new_order')}
              color={colors.newOrder}
              contentColor="#000000"
              onPress={() => router.push('/orders/new')}
            />
          ) : null}
        </View>

        {places.map((place) => {
          const active = place.owns(path);
          const Icon = place.icon;
          const label = t(place.label);
          return (
            <Pressable
              key={place.key}
              accessibilityRole="link"
              accessibilityLabel={label}
              // Which page of the navigation this is (a screen reader says "current page").
              {...(active ? { 'aria-current': 'page' } : null)}
              onPress={() => router.navigate(place.href)}
              className={`min-h-12 flex-row items-center gap-3 ${BUTTON_RADIUS.full48} px-4 py-1.5 ${
                active ? 'bg-chrome-pill' : 'hover:bg-white/10 active:bg-white/15'
              }`}>
              <Icon size={NAV_ICON} color={active ? colors.chrome : colors.white} />
              {/* A name that is too long for the sidebar (on a tablet's, the narrower one) goes on to a second line. */}
              <Text
                className={`min-w-0 flex-1 text-[16px] ${active ? 'font-semibold text-ink' : 'font-medium text-white'}`}
                numberOfLines={2}>
                {label}
              </Text>
              {place.key === 'orders' && open > 0 ? (
                <View
                  className={`h-[22px] min-w-6 items-center justify-center rounded-full px-1.5 ${
                    active ? 'bg-primary' : 'bg-white/15'
                  }`}>
                  <Text className="text-[12.5px] font-semibold text-white" maxFontSizeMultiplier={1.2}>
                    {open}
                  </Text>
                </View>
              ) : null}
            </Pressable>
          );
        })}

        <View className="mt-auto gap-2.5 pt-6">
          <SyncCard />
          <Profile />
        </View>
      </ScrollView>
    </View>
  );
}
