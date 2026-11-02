import { BlurView } from 'expo-blur';
import { useRouter } from 'expo-router';
import { ArrowLeft } from 'lucide-react-native';
import type { ReactNode, Ref } from 'react';
import { Pressable, ScrollView, View, type ScrollViewInstance, type ScrollViewProps } from 'react-native';
import { styled } from 'react-native-css';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { HEADER_HEIGHT } from '@/components/app-header';
import { colors } from '@/components/ui/colors';
import { Text } from '@/components/ui/text';
import { useI18n } from '@/lib/i18n';
import { useKeyboardHeight } from '@/lib/use-keyboard';

const BackBlur = styled(BlurView);

// The row of a page header, under the notch: the same for the title of a tab and of a page you went into.
const HEADER_TOP_GAP = 6;
const HEADER_ROW_HEIGHT = 56;
const HEADER_ROW = 'flex-row items-center gap-4 pb-4';

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
};

/**
 * A page of the signed-in app: light grey, all the way up. The app header has no colour of its own: the
 * page goes on under it, and leaves room at the top for the notch and the header. The bottom of a tab's
 * page is rounded by the tabs layout (it stands over the navigation); with a `dock` the page is rounded
 * at the bottom here, as the dock sits under it, on the dark ground of the navigation.
 */
export function Screen({ children, dock, footer, logo, flush }: ScreenProps) {
  const insets = useSafeAreaInsets();
  // With the keyboard up, the dock and what is under it step aside: on Android they would ride on top of it.
  const keyboardOpen = useKeyboardHeight() > 0;
  const paddingTop = flush ? 0 : insets.top + (logo ? HEADER_HEIGHT : HEADER_TOP_GAP);

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

type ScreenHeaderProps = {
  title: string;
  subtitle?: string;
  right?: ReactNode;
  // Stays at the top of the page while it is scrolled, on a blurred ground, as a floating `DetailHeader` does.
  floating?: boolean;
};

// The title of a main tab, with its actions on the right: the row of a `DetailHeader` without the back button.
export function ScreenHeader({ title, subtitle, right, floating }: ScreenHeaderProps) {
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
      {right ? <View className="flex-row items-center">{right}</View> : null}
    </>
  );

  if (floating) {
    return <FloatingBar className="px-page">{content}</FloatingBar>;
  }

  return (
    <View className={`${HEADER_ROW} px-page`} style={{ height: HEADER_ROW_HEIGHT }}>
      {content}
    </View>
  );
}

// The bar of a floating header: it reaches the top of the screen, on a blur with a tint, and the row of the header
// is under the notch.
function FloatingBar({ children, className }: { children: ReactNode; className: string }) {
  const insets = useSafeAreaInsets();

  return (
    <View
      pointerEvents="box-none"
      className="absolute inset-x-0 top-0 z-10 overflow-hidden"
      style={{ height: insets.top + HEADER_TOP_GAP + HEADER_ROW_HEIGHT }}>
      <BackBlur intensity={50} tint="light" className="absolute inset-0" pointerEvents="none" />
      <View className="absolute inset-0 bg-surface/70" pointerEvents="none" />
      <View
        pointerEvents="box-none"
        className={`${HEADER_ROW} ${className}`}
        style={{ marginTop: insets.top + HEADER_TOP_GAP, height: HEADER_ROW_HEIGHT }}>
        {children}
      </View>
    </View>
  );
}

// The room between the foot of the header and the first thing of the page.
const DETAIL_CONTENT_GAP = 0;

/** How tall a floating `DetailHeader` is, from the top of the screen; the bar reaches the top of the screen. */
export function useDetailHeaderHeight() {
  const insets = useSafeAreaInsets();
  return insets.top + HEADER_TOP_GAP + HEADER_ROW_HEIGHT;
}

/**
 * The scroll view of a page with a floating `DetailHeader`: it fills the page to the very top, and its content
 * starts under the header, so that when it is scrolled it goes up behind the header.
 */
export function DetailScroll({ contentContainerStyle, ...props }: ScrollViewProps & { ref?: Ref<ScrollViewInstance> }) {
  const top = useDetailHeaderHeight();
  return (
    <ScrollView
      {...props}
      contentContainerStyle={[{ paddingTop: top + DETAIL_CONTENT_GAP }, contentContainerStyle]}
    />
  );
}

/** The top room a list with a floating `DetailHeader` needs, for its own `contentContainerStyle`. */
export function useDetailContentTop() {
  return useDetailHeaderHeight() + DETAIL_CONTENT_GAP;
}

type DetailHeaderProps = {
  title: string;
  right?: ReactNode;
  // Instead of going back straight away (a form with unsaved changes asks first).
  onBack?: () => void;
  // Stays at the top of the page while it is scrolled, on a blurred ground, reaching the very top of the screen. The
  // page then uses `flush`, and its scroll view is a `DetailScroll`. Without it the header is a row at the top.
  floating?: boolean;
};

// The bar of a page you went into: a round button to go back, a large title, and actions. The button is
// frosted: a blur with a grey tint over it, so that it shows on the page without being a block of colour.
export function DetailHeader({ title, right, onBack, floating }: DetailHeaderProps) {
  const { t } = useI18n();
  const router = useRouter();

  const goBack = () => {
    if (onBack) {
      onBack();
    } else if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/home');
    }
  };

  const content = (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('back')}
        hitSlop={8}
        onPress={goBack}
        className="size-11 items-center justify-center overflow-hidden rounded-full active:opacity-60">
        <BackBlur intensity={40} tint="light" className="absolute inset-0" />
        <View className="absolute inset-0 bg-[rgba(60,60,67,0.12)]" />
        <ArrowLeft size={22} color={colors.ink} />
      </Pressable>
      <Text accessibilityRole="header" className={`flex-1 ${PAGE_TITLE}`} numberOfLines={1}>
        {title}
      </Text>
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
