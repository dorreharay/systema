/**
 * What makes two phone numbers one number, however they were typed: its digits, with a Ukrainian number always in its
 * international form (050 123-45-67, 0501234567 and +38 (050) 123-45-67 are the same number). Empty when there are no digits.
 */
export function phoneKey(phone) {
  const digits = String(phone ?? '').replace(/\D/g, '');
  if (/^0\d{9}$/.test(digits)) return `38${digits}`;
  if (/^80\d{9}$/.test(digits)) return `3${digits}`;
  return digits;
}
