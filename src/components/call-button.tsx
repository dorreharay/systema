import { Phone } from 'lucide-react-native';

import IconButton from '@/components/ui/icon-button';
import { callPhone } from '@/lib/contact';
import { useI18n } from '@/lib/i18n';

// A phone in the header of a page about someone: it calls the number. The number is not on it, so it is in the label a
// screen reader says.
export default function CallButton({ phone }: { phone: string }) {
  const { t } = useI18n();

  return <IconButton icon={Phone} label={t('contact_call', { phone })} onPress={() => void callPhone(phone)} />;
}
