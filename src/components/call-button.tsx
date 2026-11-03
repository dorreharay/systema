
import { Phone } from '@/components/icons';
import IconButton from '@/components/ui/icon-button';
import { callPhone } from '@/lib/contact';
import { useI18n } from '@/lib/i18n';

// A phone by someone's name (in the header of a page about them, or in the card of an order): it calls the number. The
// number is not on it, so it is in the label a screen reader says.
export default function CallButton({ phone, round }: { phone: string; round?: boolean }) {
  const { t } = useI18n();

  return <IconButton icon={Phone} label={t('contact_call', { phone })} round={round} onPress={() => void callPhone(phone)} />;
}
