import { useRouter } from 'expo-router';
import { ArrowLeft } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { COMPACT_HEADER_HEIGHT, HEADER_HEIGHT } from '@/components/app-header';
import { colors } from '@/components/ui/colors';
import IconButton from '@/components/ui/icon-button';
import { Text } from '@/components/ui/text';
import { useI18n } from '@/lib/i18n';
import { useKeyboardHeight } from '@/lib/use-keyboard';

type ScreenProps = {
  children: ReactNode;
  // The page has the logo in its header (the home page): the header leaves room for it. On the other pages
  // the header is empty, and half as tall.
  logo?: boolean;
  // Something set apart from the page: it sits under it, edge to edge, a gap of 1 below, in a rounded
  // container of its own, on the same dark ground as the navigation.
  dock?: ReactNode;
  // Under the dock, on the same dark ground: the navigation, on the pages that are not in the tabs.
  footer?: ReactNode;
};

/**
 * A page of the signed-in app: light grey, all the way up. The app header has no colour of its own: the
 * page goes on under it, and leaves room at the top for the notch and the header. The bottom of a tab's
 * page is rounded by the tabs layout (it stands over the navigation); with a `dock` the page is rounded
 * at the bottom here, as the dock sits under it, on the dark ground of the navigation.
 */
export function Screen({ children, dock, footer, logo }: ScreenProps) {
  const insets = useSafeAreaInsets();
  // With the keyboard up, the dock and what is under it step aside: on Android they would ride on top of it.
  const keyboardOpen = useKeyboardHeight() > 0;
  const paddingTop = insets.top + (logo ? HEADER_HEIGHT : COMPACT_HEADER_HEIGHT);

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

type ScreenHeaderProps = { title: string; subtitle?: string; right?: ReactNode };

// The title of a main tab, with its actions on the right.
export function ScreenHeader({ title, subtitle, right }: ScreenHeaderProps) {
  return (
    <View className="min-h-16 flex-row items-center justify-between gap-3 px-page pb-6 pt-3">
      <View className="flex-1">
        <Text accessibilityRole="header" className="text-[28px] font-semibold" numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text className="text-[14px] text-muted" numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right ? <View className="flex-row items-center">{right}</View> : null}
    </View>
  );
}

type DetailHeaderProps = {
  title: string;
  right?: ReactNode;
  // Instead of going back straight away (a form with unsaved changes asks first).
  onBack?: () => void;
};

// The bar of a page you went into: Back, a title, and actions.
export function DetailHeader({ title, right, onBack }: DetailHeaderProps) {
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

  return (
    <View className="min-h-14 flex-row items-center gap-1 px-4">
      <IconButton icon={ArrowLeft} label={t('back')} onPress={goBack} />
      <Text
        accessibilityRole="header"
        className="flex-1 text-[19px] font-semibold"
        numberOfLines={1}>
        {title}
      </Text>
      {right ? <View className="flex-row items-center pr-2">{right}</View> : null}
    </View>
  );
}
