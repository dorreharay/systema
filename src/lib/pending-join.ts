/**
 * The code of an invitation to a workshop (`https://myrestring.com/join?code=ABCDE-FGHJK`) that was opened before the person could use it:
 * they are signed out, have not confirmed the address yet, or have not finished the first-run setup, and the guards of the root layout and
 * of the app layout send such a link to the page they are due at, which loses the code. The code is kept on the device meanwhile and is
 * taken out once, when the person can get to the page of joining (components/join-link.tsx).
 *
 * Pure, no React and no React Native: the place it is kept in is handed in (`pending-join-app.ts` gives it the device's), so the rules
 * run in plain Node (`node scripts/test-pending-join.mjs`).
 */

export const PENDING_JOIN_KEY = 'pending_join_code';

// An invitation lives seven days (STUDIO_INVITE_DAYS at the server): a code kept longer than that is of no use. The limit is also what
// keeps one that was left behind from turning up later: the keychain of the iPhone outlives the app that wrote to it.
export const PENDING_JOIN_MS = 7 * 24 * 60 * 60 * 1000;

// The same bounds as the page of joining and the server have (team-support.ts): ten letters and digits, and the server takes any of at
// least six (it finds out whether it is a good one).
const CODE_LENGTH = 10;
const CODE_LEAST = 6;

/** The code in what a link carried (`?code=`, one value or several), as capitals and digits only; null when there is none worth keeping. */
export function joinCodeOf(value: unknown): string | null {
  const text = Array.isArray(value) ? value[0] : value;
  if (typeof text !== 'string') return null;
  const clean = text.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, CODE_LENGTH);
  return clean.length >= CODE_LEAST ? clean : null;
}

/** What is kept on the device: the app's own small storage (local-storage.ts), which never rejects. */
export type PendingStore = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
};

function unpack(raw: string | null, now: number): string | null {
  if (!raw) return null;
  try {
    const saved = JSON.parse(raw) as { code?: unknown; at?: unknown } | null;
    const code = joinCodeOf(saved?.code);
    if (!code || typeof saved?.at !== 'number' || !Number.isFinite(saved.at)) return null;
    return now - saved.at > PENDING_JOIN_MS ? null : code;
  } catch {
    return null;
  }
}

/**
 * One code at a time. `remember` replaces the one before it, `take` gives it out once and forgets it, `forget` (signing out) drops it. They
 * run one after another in the order they were asked for, so a code asked to be forgotten is not brought back by a write that was slower.
 * None of them rejects: a storage that fails is "nothing kept".
 */
export function createPendingJoin(store: PendingStore, now: () => number = Date.now) {
  let turn: Promise<unknown> = Promise.resolve();
  const inOrder = <T>(job: () => Promise<T>): Promise<T> => {
    const result = turn.then(job);
    turn = result.catch(() => undefined);
    return result;
  };

  return {
    remember: (value: unknown): Promise<void> => {
      const code = joinCodeOf(value);
      if (!code) return Promise.resolve();
      return inOrder(() => store.setItem(PENDING_JOIN_KEY, JSON.stringify({ code, at: now() }))).catch(() => undefined);
    },
    take: (): Promise<string | null> =>
      inOrder(async () => {
        const raw = await store.getItem(PENDING_JOIN_KEY);
        if (raw !== null) await store.removeItem(PENDING_JOIN_KEY);
        return unpack(raw, now());
      }).catch(() => null),
    forget: (): Promise<void> => inOrder(() => store.removeItem(PENDING_JOIN_KEY)).catch(() => undefined),
  };
}
