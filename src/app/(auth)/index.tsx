import { Pressable, Text, View } from 'react-native';

import AuthLayout from '@/components/auth-layout';
import AuthLink from '@/components/auth-link';
import { colors } from '@/components/ui/colors';
import Shortcut from '@/components/ui/shortcut';
import { LANGUAGES, useI18n } from '@/lib/i18n';

// The first screen when signed out: what the app is for, and the two ways in.
export default function Welcome() {
  const { t, language, setLanguage } = useI18n();

  return (
    <AuthLayout
      title={t('welcome_title')}
      subtitle={t('welcome_subtitle')}
      shade={false}
      footer={
        <View className="flex-row justify-center gap-1" accessibilityRole="radiogroup">
          {LANGUAGES.map((item) => (
            <Pressable
              key={item.code}
              accessibilityRole="radio"
              accessibilityState={{ selected: language === item.code }}
              hitSlop={6}
              onPress={() => setLanguage(item.code)}
              className="min-h-11 justify-center px-3 active:opacity-70">
              <Text
                className={`text-sm ${language === item.code ? 'font-semibold text-white' : 'font-normal text-white/60'}`}>
                {item.label}
              </Text>
            </Pressable>
          ))}
        </View>
      }>
      <View className="gap-3">
        <AuthLink href="/register" prefetch asChild>
          <Shortcut slim label={t('get_started')} color={colors.white} contentColor={colors.ink} />
        </AuthLink>
        <AuthLink href="/login" prefetch asChild>
          <Shortcut slim label={t('sign_in')} color="rgba(255, 255, 255, 0.14)" contentColor={colors.white} />
        </AuthLink>
      </View>
    </AuthLayout>
  );
}
