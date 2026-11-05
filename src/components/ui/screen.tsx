import { BlurView } from 'expo-blur';
import { useRouter } from 'expo-router';
import type { ReactNode, Ref } from 'react';
import { Pressable, ScrollView, View, type ScrollViewInstance, type ScrollViewProps } from 'react-native';
import { styled } from 'react-native-css';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { LOGO_FOOT } from '@/components/app-header';
import { ArrowLeft } from '@/components/icons';
import SyncPill from '@/components/sync-pill';
import { BUTTON_RADIUS } from '@/components/ui/button-radius';
import { colors } from '@/components/ui/colors';
import {
  DockProvider,
  InPageActions,
  PAGE_COLUMN,
  PAGE_SIDES,
  PAGE_WIDTH_CLASS,
  useDock,
  type PageWidth,
} from '@/components/ui/page';
import { Text } from '@/components/ui/text';
import { useI18n } from '@/lib/i18n';
import { useIsWide } from '@/lib/layout';
import { useKeyboardTakesRoom } from '@/lib/use-keyboard';

const BackBlur = styled(BlurView);

// The row of a page header, under the notch: the same for the title of a tab and of a page you went into.
const HEADER_TOP_GAP = 6;
const HEADER_ROW_HEIGHT = 56;
const HEADER_ROW = 'flex-row items-center gap-4 pb-4';
/** How much lower than the row of a detail header the title of a tab stands (the tabs' headers all have it). */
export const TAB_HEADER_DROP = 16;
// The room the logo takes under the notch, on the page that has it: the page starts a little below the foot of the logo
// (see app-header), not below the whole of the header.
const LOGO_ROOM = LOGO_FOOT + 16;

type ScreenProps = {
  children: ReactNode;
  // The page has the logo in its header (the home page): the header leaves room for it. On the other pages
  // the header is empty: the row with the title of the page comes right under the notch.
  logo?: boolean;
  // Something set apart from the page: it sits under it, edge to edge, a gap of 1 below, in a rounded
  // container of its own, on the same dark ground as the navigation.
  dock?: ReactNode;
  // Under the dock, on the same dark ground: the navigation, on the pages that are not in the tabs.
  footer?: ReactNode;
  // The page starts at the very top of the screen, under the notch and the app header: it has a header of its own
  // (a floating `DetailHeader`) that reaches the top, and its content goes up under it.
  flush?: boolean;
  // On a wide page (tablet and desktop, the web) how wide its column is.
  width?: PageWidth;
  // On a wide page the `dock` is not at the foot of the page but in its header, as a button the size of the header's. A page whose
  // dock is not a button (the home page has three) says what goes there instead, or `false` for nothing.
  wideDock?: ReactNode | false;
};

/**
 * A page of the signed-in app: light grey, all the way up. The app header has no colour of its own: the
 * page goes on under it, and leaves room at the top for the notch and the header. The bottom of a tab's
 * page is rounded by the tabs layout (it stands over the navigation); with a `dock` the page is rounded
 * at the bottom here, as the dock sits under it, on the dark ground of the navigation.
 */
export function Screen({ children, dock, footer, logo, flush, width = 'narrow', wideDock }: ScreenProps) {
  const insets = useSafeAreaInsets();
  // With the keyboard up, the dock and what is under it step aside: on Android they would ride on top of it.
  const keyboardOpen = useKeyboardTakesRoom();
  const wide = useIsWide();
  const paddingTop = flush ? 0 : insets.top + (logo ? LOGO_ROOM : HEADER_TOP_GAP);

  // A wide page stands in the pane of the shell (see AppShell): there is no notch, no logo and no navigation under it, and the dock
  // is in the header (`WideHeader`), so only the column is left to make.
  if (wide) {
    return (
      <View className={`flex-1 bg-surface ${PAGE_WIDTH_CLASS[width]}`}>
        <DockProvider dock={wideDock === undefined ? dock : wideDock}>{children}</DockProvider>
      </View>
    );
  }

  if (!dock) {
    return (
      <View className="flex-1 bg-surface" style={{ paddingTop }}>
        {children}
      </View>
    );
  }

  // The radius is the one of the tabs' pages (see the tabs layout).
  return (
    <View className="flex-1" style={{ backgroundColor: colors.chrome }}>
      <View className="flex-1 overflow-hidden rounded-b-[18px] bg-surface" style={{ paddingTop }}>
        {children}
      </View>
      {keyboardOpen ? null : (
        <>
          <View className="mt-1 overflow-hidden rounded-[18px]">{dock}</View>
          {footer}
        </>
      )}
    </View>
  );
}

// The title of a page: in the header of a tab and in the header of a page that was gone into, the same size.
const PAGE_TITLE = 'text-[28px] font-semibold';

/**
 * The header of a wide page (tablet and desktop): in the column of the page, in the flow of it, with the title, the actions of the
 * page, and the page's main action (what is a large button on the foot of the phone's page) as a button of the header's size at the
 * end. The back button of a page that was gone into is `lead`. (The sync of the phone and the server is in the sidebar, not here.)
 */
function WideHeader({
  lead,
  title,
  subtitle,
  right,
}: {
  lead?: ReactNode;
  title: string;
  subtitle?: string;
  right?: ReactNode;
}) {
  const dock = useDock();

  return (
    <View className={`w-full max-w-[var(--page-max)] flex-row items-center gap-4 self-center pb-6 pt-12 ${PAGE_SIDES}`}>
      {lead}
      <View className="min-w-0 flex-1">
        <Text accessibilityRole="header" className={PAGE_TITLE} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text className="text-[14px] text-muted" numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {/* (The sync is in the sidebar, which every wide page has: no mark of it here.) */}
      <View className="flex-row items-center gap-2">
        {right}
        {dock ? <InPageActions>{dock}</InPageActions> : null}
      </View>
    </View>
  );
}

type ScreenHeaderProps = {
  title: string;
  subtitle?: string;
  right?: ReactNode;
  // Stays at the top of the page while it is scrolled, on a blurred ground, as a floating `DetailHeader` does.
  floating?: boolean;
  // How much lower than the usual place under the notch the title stands; a floating header's page then asks
  // `useDetailContentTop` for the same.
  drop?: number;
};

// The title of a main tab, with its actions on the right: the row of a `DetailHeader` without the back button.
export function ScreenHeader({ title, subtitle, right, floating, drop }: ScreenHeaderProps) {
  const wide = useIsWide();

  if (wide) {
    return <WideHeader title={title} subtitle={subtitle} right={right} />;
  }

  const content = (
    <>
      <View className="flex-1">
        <Text accessibilityRole="header" className={PAGE_TITLE} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text className="text-[14px] text-muted" numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      <View className="flex-row items-center gap-2">
        <SyncPill />
        {right}
      </View>
    </>
  );

  if (floating) {
    return (
      <FloatingBar className="px-page" drop={drop}>
        {content}
      </FloatingBar>
    );
  }

  return (
    <View className={`${HEADER_ROW} px-page`} style={{ height: HEADER_ROW_HEIGHT, marginTop: drop }}>
      {content}
    </View>
  );
}

// The bar of a floating header: it reaches the top of the screen, on a blur with a tint, and the row of the header
// is under the notch.
function FloatingBar({ children, className, drop = 0 }: { children: ReactNode; className: string; drop?: number }) {
  const insets = useSafeAreaInsets();

  return (
    <View
      pointerEvents="box-none"
      className="absolute inset-x-0 top-0 z-10 overflow-hidden"
      style={{ height: insets.top + HEADER_TOP_GAP + drop + HEADER_ROW_HEIGHT }}>
      <BackBlur intensity={50} tint="light" className="absolute inset-0" pointerEvents="none" />
      <View className="absolute inset-0 bg-surface/70" pointerEvents="none" />
      <View
        pointerEvents="box-none"
        className={`${HEADER_ROW} ${className}`}
        style={{ marginTop: insets.top + HEADER_TOP_GAP + drop, height: HEADER_ROW_HEIGHT }}>
        {children}
      </View>
    </View>
  );
}

// The room between the foot of the header and the first thing of the page.
const DETAIL_CONTENT_GAP = 0;

/** How tall a floating `DetailHeader` is, from the top of the screen; the bar reaches the top of the screen. */
export function useDetailHeaderHeight(drop = 0) {
  const insets = useSafeAreaInsets();
  const wide = useIsWide();
  // The header of a wide page is a row in the flow of the page: nothing floats over the list, so it has no room to leave.
  if (wide) return 0;
  return insets.top + HEADER_TOP_GAP + drop + HEADER_ROW_HEIGHT;
}

/**
 * The scroll view of a page with a floating `DetailHeader`: it fills the page to the very top, and its content
 * starts under the header, so that when it is scrolled it goes up behind the header.
 */
export function DetailScroll({
  contentContainerStyle,
  contentContainerClassName = '',
  ...props
}: ScrollViewProps & { ref?: Ref<ScrollViewInstance> }) {
  const top = useDetailHeaderHeight();
  return (
    <ScrollView
      bounces={false}
      overScrollMode="never"
      {...props}
      // On a wide page the content stands in the column of the page, in the middle of the scroll view, so that the scroll bar is at
      // the edge of the window and not of the column.
      contentContainerClassName={`${contentContainerClassName} ${PAGE_COLUMN} ${PAGE_SIDES}`}
      contentContainerStyle={[{ paddingTop: top + DETAIL_CONTENT_GAP }, contentContainerStyle]}
    />
  );
}

/** The top room a list with a floating `DetailHeader` needs, for its own `contentContainerStyle`. */
export function useDetailContentTop(drop = 0) {
  return useDetailHeaderHeight(drop) + DETAIL_CONTENT_GAP;
}

type DetailHeaderProps = {
  title: string;
  right?: ReactNode;
  // Instead of going back straight away (a form with unsaved changes asks first).
  onBack?: () => void;
  // Stays at the top of the page while it is scrolled, on a blurred ground, reaching the very top of the screen. The
  // page then uses `flush`, and its scroll view is a `DetailScroll`. Without it the header is a row at the top.
  floating?: boolean;
  // A page that the sidebar of a wide screen leads to (the clients, the stock): there it is a place of its own, not a page that was
  // gone into, so it has no back button. On the phone it has one, as it always had.
  topLevel?: boolean;
};

// The bar of a page you went into: a round button to go back, a large title, and actions. The button is
// frosted: a blur with a grey tint over it, so that it shows on the page without being a block of colour.
export function DetailHeader({ title, right, onBack, floating, topLevel }: DetailHeaderProps) {
  const { t } = useI18n();
  const router = useRouter();
  const wide = useIsWide();

  const goBack = () => {
    if (onBack) {
      onBack();
    } else if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/home');
    }
  };

  if (wide) {
    return (
      <WideHeader
        title={title}
        right={right}
        lead={
          topLevel ? undefined : (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('back')}
              onPress={goBack}
              className={`size-11 items-center justify-center ${BUTTON_RADIUS.full44} bg-white hover:bg-neutral-100 active:opacity-60`}>
              <ArrowLeft size={22} color={colors.ink} />
            </Pressable>
          )
        }
      />
    );
  }

  const content = (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('back')}
        hitSlop={8}
        onPress={goBack}
        className="size-11 items-center justify-center overflow-hidden rounded-full hover:opacity-80 active:opacity-60">
        <BackBlur intensity={40} tint="light" className="absolute inset-0" />
        <View className="absolute inset-0 bg-[rgba(60,60,67,0.12)]" />
        <ArrowLeft size={22} color={colors.ink} />
      </Pressable>
      {/* A title that does not fit (an order number beside two buttons) gets a little smaller before it is cut. */}
      <Text
        accessibilityRole="header"
        className={`flex-1 ${PAGE_TITLE}`}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.8}>
        {title}
      </Text>
      <SyncPill />
      {right ? <View className="flex-row items-center pr-2">{right}</View> : null}
    </>
  );

  if (!floating) {
    return (
      <View className={`${HEADER_ROW} px-page`} style={{ height: HEADER_ROW_HEIGHT }}>
        {content}
      </View>
    );
  }

  return <FloatingBar className="px-5">{content}</FloatingBar>;
}
