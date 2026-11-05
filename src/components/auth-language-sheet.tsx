import { Pressable, View } from 'react-native';

import { Check } from '@/components/icons';
import { BUTTON_RADIUS } from '@/components/ui/button-radius';
import { colors } from '@/components/ui/colors';
import Sheet from '@/components/ui/sheet';
import { Text } from '@/components/ui/text';
import { LANGUAGES, useI18n } from '@/lib/i18n';

type AuthLanguageSheetProps = {
  visible: boolean;
  onClose: () => void;
};

// The choice of the language on the welcome screen, in a sheet as dark as the sign-in screens: the languages in a list, the one
// that is on with a tick. Choosing one changes the screen at once and takes the sheet away.
export default function AuthLanguageSheet({ visible, onClose }: AuthLanguageSheetProps) {
  const { t, language, setLanguage } = useI18n();

  return (
    <Sheet dark visible={visible} onClose={onClose} title={t('settings_language')}>
      <View accessibilityRole="radiogroup" className="gap-1 pt-2">
        {LANGUAGES.map((item) => {
          const selected = item.code === language;
          return (
            <Pressable
              key={item.code}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              onPress={() => {
                setLanguage(item.code);
                onClose();
              }}
              className={`min-h-14 flex-row items-center justify-between ${BUTTON_RADIUS.xl} px-4 hover:bg-white/10 active:bg-white/15 ${
                selected ? 'bg-white/10' : ''
              }`}>
              <Text className="text-[17px] font-medium text-white">{item.label}</Text>
              {selected ? <Check size={20} color={colors.white} /> : null}
            </Pressable>
          );
        })}
      </View>
    </Sheet>
  );
}
