/**
 * The number as messengers want it: digits only, the country code first, no plus and no zeros in front. A number typed with a
 * plus or with 00 is taken as it is. A Ukrainian number typed without either is given its code (050 123-45-67, 0501234567 and
 * 80501234567 are one number with +38 (050) 123-45-67: the rule is the server's, see backend/src/utils/phone.js). The local form
 * of another country's number has no code to put in front of it: null, and so for what is not a phone number.
 */
export function messengerNumber(phone: string): string | null {
  const typed = phone.trim();
  const digits = typed.replace(/\D/g, '');

  let international: string;
  if (typed.startsWith('+')) international = digits;
  else if (typed.startsWith('00')) international = digits.slice(2);
  else if (/^0\d{9}$/.test(digits)) international = `38${digits}`;
  else if (/^80\d{9}$/.test(digits)) international = `3${digits}`;
  else if (/^380\d{9}$/.test(digits)) international = digits;
  else return null;

  // An international number has at most 15 digits, and none of them starts with a zero.
  return /^[1-9]\d{7,14}$/.test(international) ? international : null;
}

/**
 * What makes two phone numbers one number, however they were typed: its digits, with a Ukrainian number always in its
 * international form. The server's rule (backend/src/utils/phone.js), which the phone applies to the clients it has before it
 * sends a new one, so that a number that is taken is refused at once and not when the connection is back.
 */
export function phoneKey(phone: string | null | undefined): string {
  const digits = String(phone ?? '').replace(/\D/g, '');
  if (/^0\d{9}$/.test(digits)) return `38${digits}`;
  if (/^80\d{9}$/.test(digits)) return `3${digits}`;
  return digits;
}

/** WhatsApp's link to the chat with a number, with the text written in the box (https://faq.whatsapp.com/5913398998672934). */
export const whatsappLink = (number: string, text: string) => `https://wa.me/${number}?text=${encodeURIComponent(text)}`;

/** Telegram's link to a person by phone number, with the text written in the box (https://core.telegram.org/api/links). */
export const telegramLink = (number: string, text: string) => `https://t.me/+${number}?text=${encodeURIComponent(text)}`;

/**
 * Viber's link to the chat with a number. It is not in Viber's documentation (that has the links of bots only), and it takes no
 * text: the message is put on the clipboard for the person to paste. The plus is written as %2B; where the sources differ on it,
 * this is the form with the country code in full. Not yet tried on a phone with Viber on it.
 */
export const viberLink = (number: string) => `viber://chat?number=%2B${number}`;
