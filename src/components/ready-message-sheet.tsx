import { useState } from 'react';
import { View } from 'react-native';

import { Copy, MessageSquare, TelegramLogo, WhatsappLogo, X } from '@/components/icons';
import { colors } from '@/components/ui/colors';
import Sheet from '@/components/ui/sheet';
import Shortcut from '@/components/ui/shortcut';
import { Text } from '@/components/ui/text';
import { useToast } from '@/components/ui/toast';
import type { ChatResult } from '@/lib/contact';
import { copyText, openTelegram, openWhatsApp, textPhone } from '@/lib/contact';
import { useI18n } from '@/lib/i18n';

type ReadyMessageSheetProps = {
  visible: boolean;
  onClose: () => void;
  message: string;
  phone: string | null;
};

// After "Mark as Ready": a message for the customer that is already written. Copying it is optional, and so is sending it: by
// WhatsApp or Telegram to the number of the customer (the chat opens with the text in its box), or as a text message.
export default function ReadyMessageSheet({ visible, onClose, message, phone }: ReadyMessageSheetProps) {
  const { t } = useI18n();
  const toast = useToast();

  const copy = async () => {
    if (await copyText(message)) toast.success(t('copied'));
    else toast.error(t('copy_failed'));
  };

  // The sheet is a native modal, with the toasts behind it: what went wrong with a chat is said in the sheet itself.
  const [problem, setProblem] = useState<string>();

  const close = () => {
    setProblem(undefined);
    onClose();
  };

  const chat = async (open: (phone: string, text: string) => Promise<ChatResult>) => {
    if (!phone) return;
    setProblem(undefined);
    const result = await open(phone, message);
    if (result === 'no_country_code') setProblem(t('chat_no_country_code'));
    else if (result === 'failed') setProblem(t('chat_open_failed'));
  };

  return (
    <Sheet visible={visible} onClose={close} title={t('ready_sheet_title')}>
      <View className="gap-4 pt-2">
        <Text className="text-[16.5px] text-muted">{t('ready_sheet_hint')}</Text>
        <View className="rounded-xl bg-surface p-4">
          <Text selectable className="text-base">
            {message}
          </Text>
        </View>
        {problem ? <Text className="text-[15.4px] text-danger">{problem}</Text> : null}
        <View className="gap-2">
          <Shortcut icon={Copy} label={t('copy_message')} color={colors.primary} contentColor={colors.white} onPress={copy} />
          {phone ? (
            <>
              <Shortcut
                compact
                icon={WhatsappLogo}
                label={t('send_whatsapp')}
                color={colors.surface} contentColor={colors.ink}
                onPress={() => void chat(openWhatsApp)}
              />
              <Shortcut
                compact
                icon={TelegramLogo}
                label={t('send_telegram')}
                color={colors.surface} contentColor={colors.ink}
                onPress={() => void chat(openTelegram)}
              />
              <Shortcut
                compact
                icon={MessageSquare}
                label={t('send_text')}
                color={colors.surface} contentColor={colors.ink}
                onPress={() => void textPhone(phone, message)}
              />
            </>
          ) : null}
          <Shortcut compact icon={X} label={t('not_now')} color={colors.surface} contentColor={colors.ink} onPress={close} />
        </View>
      </View>
    </Sheet>
  );
}
