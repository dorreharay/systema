import { Text } from 'react-native';

import { useI18n } from '@/lib/i18n';
import { openLegalPage, type LegalPage } from '@/lib/legal';

const MARKERS = /(\{terms\}|\{privacy\})/;

/**
 * What Apple wants to be near a subscription's purchase button (App Review 3.1.2): where the payment is taken, that it renews by itself at the
 * price shown unless it is cancelled 24 hours before the end, and where to manage it, with the Terms and the Privacy Policy as links. One
 * translation with {terms} and {privacy} in it, so each language puts the names where its grammar wants them (as LegalNote does).
 */
export default function SubscriptionTerms({ onError }: { onError?: () => void }) {
  const { t, language } = useI18n();

  const open = async (page: LegalPage) => {
    if (!(await openLegalPage(page, language))) onError?.();
  };

  return (
    <Text className="px-1 text-[12.5px] leading-[17px] text-muted">
      {t('plan_terms')
        .split(MARKERS)
        .map((part, index) => {
          if (part !== '{terms}' && part !== '{privacy}') return part;
          const page: LegalPage = part === '{terms}' ? 'terms' : 'privacy';
          return (
            <Text key={index} accessibilityRole="link" onPress={() => void open(page)} className="font-medium text-secondary underline">
              {t(page === 'terms' ? 'settings_terms' : 'settings_privacy_policy')}
            </Text>
          );
        })}
    </Text>
  );
}
