import { Text } from 'react-native';

import { useI18n } from '@/lib/i18n';
import { openLegalPage, type LegalPage } from '@/lib/legal';

const MARKERS = /(\{terms\}|\{privacy\})/;

// "By creating an account, you agree to the Terms of Service and the Privacy Policy", with the two names as links. The
// sentence is one translation with {terms} and {privacy} in it, so each language puts the names where its grammar wants them.
export default function LegalNote({ onError }: { onError?: () => void }) {
  const { t, language } = useI18n();

  const open = async (page: LegalPage) => {
    if (!(await openLegalPage(page, language))) onError?.();
  };

  return (
    <Text className="text-center text-[13.5px] font-normal leading-5 text-white/80">
      {t('register_agree')
        .split(MARKERS)
        .map((part, index) => {
          if (part !== '{terms}' && part !== '{privacy}') return part;
          const page: LegalPage = part === '{terms}' ? 'terms' : 'privacy';
          return (
            <Text
              key={index}
              accessibilityRole="link"
              onPress={() => void open(page)}
              className="font-medium text-white underline">
              {t(page === 'terms' ? 'register_terms_link' : 'register_privacy_link')}
            </Text>
          );
        })}
    </Text>
  );
}
