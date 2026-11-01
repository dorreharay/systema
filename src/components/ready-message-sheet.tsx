import { Copy, MessageSquare } from 'lucide-react-native';
import { View } from 'react-native';

import AppButton from '@/components/ui/app-button';
import { colors } from '@/components/ui/colors';
import Sheet from '@/components/ui/sheet';
import { Text } from '@/components/ui/text';
import { useToast } from '@/components/ui/toast';
import { copyText, textPhone } from '@/lib/contact';
import { useI18n } from '@/lib/i18n';

type ReadyMessageSheetProps = {
  visible: boolean;
  onClose: () => void;
  message: string;
  phone: string | null;
};

// After "Mark as Ready": a message for the customer that is already written. Copying it is optional.
export default function ReadyMessageSheet({ visible, onClose, message, phone }: ReadyMessageSheetProps) {
  const { t } = useI18n();
  const toast = useToast();

  const copy = async () => {
    if (await copyText(message)) toast.success(t('copied'));
    else toast.error(t('copy_failed'));
  };

  return (
    <Sheet visible={visible} onClose={onClose} title={t('ready_sheet_title')}>
      <View className="gap-4 pt-2">
        <Text className="text-[15px] text-muted">{t('ready_sheet_hint')}</Text>
        <View className="rounded-xl bg-surface p-4">
          <Text selectable className="text-base">
            {message}
          </Text>
        </View>
        <View className="gap-2">
          <AppButton
            large
            title={t('copy_message')}
            icon={<Copy size={20} color={colors.white} />}
            onPress={copy}
          />
          {phone ? (
            <AppButton
              title={t('send_text')}
              variant="secondary"
              icon={<MessageSquare size={20} color={colors.ink} />}
              onPress={() => void textPhone(phone, message)}
            />
          ) : null}
          <AppButton title={t('not_now')} variant="ghost" onPress={onClose} />
        </View>
      </View>
    </Sheet>
  );
}
