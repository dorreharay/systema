export type Messenger = 'whatsapp' | 'telegram' | 'viber';

/** What to offer for sending a message to a customer: the messengers that open a chat with the number, in order, and whether the share sheet of the phone is offered too. */
export type MessengerChoice = { chats: readonly Messenger[]; more: boolean };

// Where Viber is among the apps most people use: Ukraine, Belarus and Moldova, and the Philippines (Business of Apps, Sinch and
// Infobip tell the same of them). Telegram is the second app there; WhatsApp is less used.
const VIBER_COUNTRIES = new Set(['UA', 'BY', 'MD', 'PH']);

// Where Telegram is used more than WhatsApp.
const TELEGRAM_COUNTRIES = new Set(['RU']);

// Where the app most people use cannot be opened with a phone number: LINE (Japan, Taiwan, Thailand), KakaoTalk (Korea), WeChat
// (China) and Zalo (Vietnam) have no link for it. Such a message goes through the share sheet of the phone, where the person picks
// the app and the customer.
const SHARE_COUNTRIES = new Set(['JP', 'TW', 'TH', 'KR', 'CN', 'VN']);

/**
 * The ways to send a message to a customer in a country (the country of the workshop). WhatsApp and Telegram are never taken away:
 * a customer may use either one wherever the workshop is, and the country only changes the order and what is added to it.
 */
export function messengersFor(country: string | undefined): MessengerChoice {
  const more = country !== undefined && SHARE_COUNTRIES.has(country);
  if (country && VIBER_COUNTRIES.has(country)) return { chats: ['viber', 'telegram', 'whatsapp'], more };
  if (country && TELEGRAM_COUNTRIES.has(country)) return { chats: ['telegram', 'whatsapp'], more };
  return { chats: ['whatsapp', 'telegram'], more };
}
