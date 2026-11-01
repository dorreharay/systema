import { Mail, MessageSquare, Phone } from 'lucide-react-native';

import ActionSheet from '@/components/ui/action-sheet';
import { callPhone, emailTo, textPhone } from '@/lib/contact';
import { useI18n } from '@/lib/i18n';

type ContactSheetProps = {
  visible: boolean;
  onClose: () => void;
  name: string;
  phone: string | null;
  email: string | null;
};

// Call, text or email a customer, depending on what is known about them.
export default function ContactSheet({ visible, onClose, name, phone, email }: ContactSheetProps) {
  const { t } = useI18n();
  return (
    <ActionSheet
      visible={visible}
      onClose={onClose}
      title={name}
      actions={[
        ...(phone
          ? [
              { label: t('contact_call', { phone }), icon: Phone, onPress: () => void callPhone(phone) },
              { label: t('contact_text'), icon: MessageSquare, onPress: () => void textPhone(phone) },
            ]
          : []),
        ...(email ? [{ label: t('contact_email', { email }), icon: Mail, onPress: () => void emailTo(email) }] : []),
      ]}
    />
  );
}
