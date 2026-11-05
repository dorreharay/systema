import { Linking, Platform, Share } from 'react-native';

import { NATIVE_CLIPBOARD, hasNativeModule } from '@/lib/native-modules';
import { messengerNumber, telegramLink, viberLink, whatsappLink } from '@/lib/phone';

/** Opens a link in the app that handles it: the phone, messages, mail or the browser. Returns false when the device cannot. */
export async function openUrl(url: string) {
  try {
    await Linking.openURL(url);
    return true;
  } catch {
    return false;
  }
}

const digits = (phone: string) => phone.replace(/[^\d+]/g, '');

export const callPhone = (phone: string) => openUrl(`tel:${digits(phone)}`);

export const textPhone = (phone: string, body?: string) => {
  // iOS separates the number from the text with "&", Android with "?".
  const separator = Platform.OS === 'ios' ? '&' : '?';
  return openUrl(`sms:${digits(phone)}${body ? `${separator}body=${encodeURIComponent(body)}` : ''}`);
};

/**
 * What came of opening a chat: `no_country_code` when the number cannot be told to a messenger, `failed` when the device cannot
 * open it, `copy_failed` when the text had to go on the clipboard (to be pasted) and could not, so that the chat was not opened.
 */
export type ChatResult = 'opened' | 'no_country_code' | 'failed' | 'copy_failed';

async function openChat(phone: string, link: (number: string, text: string) => string, text: string): Promise<ChatResult> {
  const number = messengerNumber(phone);
  if (!number) return 'no_country_code';
  return (await openUrl(link(number, text))) ? 'opened' : 'failed';
}

/** Opens the chat with the number in WhatsApp (its page where the app is not installed) with the text written: it is only left to send. */
export const openWhatsApp = (phone: string, text: string) => openChat(phone, whatsappLink, text);

/** The same in Telegram, which finds the person by the number. */
export const openTelegram = (phone: string, text: string) => openChat(phone, telegramLink, text);

/** Viber takes no text in the link: the text is put on the clipboard first, and the chat with the number is opened to paste it in. */
export async function openViber(phone: string, text: string): Promise<ChatResult> {
  const number = messengerNumber(phone);
  if (!number) return 'no_country_code';
  if (!(await copyText(text))) return 'copy_failed';
  return (await openUrl(viberLink(number))) ? 'opened' : 'failed';
}

/** Offers the text to any app of the phone that takes text (LINE, KakaoTalk, WeChat...): the person picks the app and the customer. */
export async function shareText(text: string) {
  try {
    await Share.share({ message: text });
    return true;
  } catch {
    return false;
  }
}

export const emailTo = (address: string, subject?: string, body?: string) => {
  const params = [
    subject ? `subject=${encodeURIComponent(subject)}` : '',
    body ? `body=${encodeURIComponent(body)}` : '',
  ].filter(Boolean);
  return openUrl(`mailto:${address}${params.length ? `?${params.join('&')}` : ''}`);
};

/** Puts text on the clipboard. The module is loaded when needed, so a build without it cannot crash the app. */
export async function copyText(text: string) {
  if (!hasNativeModule(NATIVE_CLIPBOARD)) return false;
  try {
    const Clipboard = await import('expo-clipboard');
    await Clipboard.setStringAsync(text);
    return true;
  } catch {
    return false;
  }
}
