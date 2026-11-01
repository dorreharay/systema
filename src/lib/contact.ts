import { Linking, Platform } from 'react-native';

import { NATIVE_CLIPBOARD, hasNativeModule } from '@/lib/native-modules';

/** Opens the phone, messages or mail app. Returns false when the device cannot. */
async function open(url: string) {
  try {
    await Linking.openURL(url);
    return true;
  } catch {
    return false;
  }
}

const digits = (phone: string) => phone.replace(/[^\d+]/g, '');

export const callPhone = (phone: string) => open(`tel:${digits(phone)}`);

export const textPhone = (phone: string, body?: string) => {
  // iOS separates the number from the text with "&", Android with "?".
  const separator = Platform.OS === 'ios' ? '&' : '?';
  return open(`sms:${digits(phone)}${body ? `${separator}body=${encodeURIComponent(body)}` : ''}`);
};

export const emailTo = (address: string, subject?: string, body?: string) => {
  const params = [
    subject ? `subject=${encodeURIComponent(subject)}` : '',
    body ? `body=${encodeURIComponent(body)}` : '',
  ].filter(Boolean);
  return open(`mailto:${address}${params.length ? `?${params.join('&')}` : ''}`);
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
