import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import AuthLanguageSheet from '@/components/auth-language-sheet';
import AuthLayout from '@/components/auth-layout';
import AuthLink from '@/components/auth-link';
import { ChevronDown } from '@/components/icons';
import { colors } from '@/components/ui/colors';
import Shortcut from '@/components/ui/shortcut';
import { LANGUAGES, useI18n } from '@/lib/i18n';

// The first screen when signed out: what the app is for, the two ways in, and the language, chosen in a sheet from a button with
// no ground of its own (it is the name of the language and an arrow), as wide as the two above it, so that all of that width can be tapped.
export default function Welcome() {
  const { t, language } = useI18n();
  const [languageOpen, setLanguageOpen] = useState(false);
  const current = LANGUAGES.find((item) => item.code === language)?.label ?? language;

  return (
    <AuthLayout
      title={t('welcome_title')}
      subtitle={t('welcome_subtitle')}
      shade={false}
      footer={
        <View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${t('settings_language')}: ${current}`}
            onPress={() => setLanguageOpen(true)}
            className="min-h-14 w-full flex-row items-center justify-center gap-1.5 px-3 hover:opacity-80 active:opacity-70">
            <Text className="text-[15.4px] font-medium text-white/90">{current}</Text>
            <ChevronDown size={16} color="rgba(255, 255, 255, 0.7)" />
          </Pressable>
          <AuthLanguageSheet visible={languageOpen} onClose={() => setLanguageOpen(false)} />
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
