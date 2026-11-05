import { useState } from 'react';
import { View } from 'react-native';

import { ChatDots, Copy, MessageSquare, MoreHorizontal, TelegramLogo, WhatsappLogo, type IconComponent } from '@/components/icons';
import { colors } from '@/components/ui/colors';
import Sheet from '@/components/ui/sheet';
import Shortcut from '@/components/ui/shortcut';
import { Text } from '@/components/ui/text';
import { useToast } from '@/components/ui/toast';
import { useAuth } from '@/lib/auth';
import type { ChatResult } from '@/lib/contact';
import { copyText, openTelegram, openViber, openWhatsApp, shareText, textPhone } from '@/lib/contact';
import { countryOfAccount } from '@/lib/countries';
import { useI18n, type TKey } from '@/lib/i18n';
import { messengersFor, type Messenger } from '@/lib/messengers';

// How each messenger is shown and opened. The names of the apps are the same in every language; what a screen reader says is the
// whole phrase.
const CHATS: Record<
  Messenger,
  { label: string; icon: IconComponent; phrase: TKey; open: (phone: string, text: string) => Promise<ChatResult> }
> = {
  whatsapp: { label: 'WhatsApp', icon: WhatsappLogo, phrase: 'send_whatsapp', open: openWhatsApp },
  telegram: { label: 'Telegram', icon: TelegramLogo, phrase: 'send_telegram', open: openTelegram },
  viber: { label: 'Viber', icon: ChatDots, phrase: 'send_viber', open: openViber },
};

type ReadyMessageSheetProps = {
  visible: boolean;
  onClose: () => void;
  message: string;
  phone: string | null;
};

// After "Mark as Ready": a message for the customer that is already written. Copying it is optional, and so is sending it: by a
// messenger to the number of the customer (the chat opens with the text in its box), or as a text message. Which messengers are
// offered depends on the country of the workshop, which is set in Settings (see messengers.ts).
export default function ReadyMessageSheet({ visible, onClose, message, phone }: ReadyMessageSheetProps) {
  const { t } = useI18n();
  const toast = useToast();
  const { user } = useAuth();
  const ways = messengersFor(countryOfAccount(user?.timezone));

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
    else if (result === 'copy_failed') setProblem(t('copy_failed'));
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
          <Shortcut dense icon={Copy} label={t('copy_message')} color={colors.primary} contentColor={colors.white} onPress={copy} />
          {phone ? (
            // The ways to send it, in one row; what does not fit goes on to the next, and the buttons of a row share its width. The
            // names of the apps are the same in every language: what a screen reader says is the whole phrase.
            <View className="flex-row flex-wrap gap-2">
              {ways.chats.map((messenger) => (
                <Shortcut
                  key={messenger}
                  dense
                  className="grow px-4"
                  icon={CHATS[messenger].icon}
                  label={CHATS[messenger].label}
                  accessibilityLabel={t(CHATS[messenger].phrase)}
                  color={colors.surface}
                  contentColor={colors.ink}
                  onPress={() => void chat(CHATS[messenger].open)}
                />
              ))}
              <Shortcut
                dense
                className="grow px-4"
                icon={MessageSquare}
                label="SMS"
                accessibilityLabel={t('send_text')}
                color={colors.surface}
                contentColor={colors.ink}
                onPress={() => void textPhone(phone, message)}
              />
              {ways.more ? (
                <Shortcut
                  dense
                  className="grow px-4"
                  icon={MoreHorizontal}
                  label={t('more_apps')}
                  accessibilityLabel={t('send_more')}
                  color={colors.surface}
                  contentColor={colors.ink}
                  onPress={() => void shareText(message)}
                />
              ) : null}
            </View>
          ) : null}
          {phone && ways.chats.includes('viber') ? <Text className="text-[14.3px] text-muted">{t('viber_paste_hint')}</Text> : null}
        </View>
        {/* Not one of the ways to send, so it stands apart from them, under a line, with no icon. */}
        <View className="border-t border-line pt-4">
          <Shortcut dense label={t('not_now')} color={colors.surface} contentColor={colors.ink} onPress={close} />
        </View>
      </View>
    </Sheet>
  );
}
