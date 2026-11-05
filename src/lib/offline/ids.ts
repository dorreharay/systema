/**
 * A new id for something made without the server: a version 4 UUID, which the server accepts as the id of a client, racket,
 * string, service or order (and of an operation), and answers a repeat of with the row it already has. Random bits come from the
 * platform's generator when there is one (`crypto.getRandomValues`), and from `Math.random` otherwise; either way a clash among
 * the few thousand ids of one stringer is out of the question, and the server only ever looks an id up among that stringer's own.
 */
export function newId(): string {
  const bytes = new Uint8Array(16);
  const random = (globalThis as { crypto?: { getRandomValues?: (array: Uint8Array) => Uint8Array } }).crypto;
  if (random?.getRandomValues) {
    random.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
