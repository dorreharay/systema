import { useRouter } from 'expo-router';
import { ArrowLeft } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { HEADER_HEIGHT } from '@/components/app-header';
import { colors } from '@/components/ui/colors';
import IconButton from '@/components/ui/icon-button';
import { Text } from '@/components/ui/text';
import { useI18n } from '@/lib/i18n';

type ScreenProps = {
  children: ReactNode;
  // Something set apart from the page: it sits under it, edge to edge, a gap of 1 below, in a rounded
  // container of its own, on the same dark ground as the navigation.
  dock?: ReactNode;
};

/** A page of the signed-in app: light grey, with room at the top for the notch and the app header over it. */
export function Screen({ children, dock }: ScreenProps) {
  const insets = useSafeAreaInsets();
  const paddingTop = insets.top + HEADER_HEIGHT;

  if (!dock) {
    return (
      <View className="flex-1 bg-surface" style={{ paddingTop }}>
        {children}
      </View>
    );
  }

  // The radius of both containers is the one of the tabs' pages (see the tabs layout).
  return (
    <View className="flex-1" style={{ backgroundColor: colors.chrome }}>
      <View className="flex-1 overflow-hidden rounded-b-[24px] bg-surface" style={{ paddingTop }}>
        {children}
      </View>
      <View className="mt-1 overflow-hidden rounded-[24px]">{dock}</View>
    </View>
  );
}

type ScreenHeaderProps = { title: string; subtitle?: string; right?: ReactNode };

// The title of a main tab, with its actions on the right.
export function ScreenHeader({ title, subtitle, right }: ScreenHeaderProps) {
  return (
    <View className="min-h-16 flex-row items-center justify-between gap-3 px-page pb-2 pt-3">
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
    <View className="min-h-14 flex-row items-center gap-1 border-b border-line bg-white px-2">
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
