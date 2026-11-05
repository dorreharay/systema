import { NATIVE_LOCALIZATION, hasNativeModule } from '@/lib/native-modules';

import type { Language } from './index';

/** What the phone says about one of the languages its owner has set: the language, and the region it is set for ("uk", "UA"). */
export type DeviceLocale = { languageCode: string | null; regionCode: string | null };

/**
 * The language the app starts in for someone who has not chosen one: the language of their phone. `locales` are the
 * languages set on it, in the order its owner put them, and the first counts. A phone in Ukraine that is in a language the
 * app does not have (a Russian one, say) gets Ukrainian; otherwise the first of the others that the app has is taken, and
 * English where there is none.
 */
export function pickLanguage(locales: readonly DeviceLocale[], supported: readonly Language[]): Language {
  const known = (code: string | null): code is Language => supported.some((language) => language === code);
  const [first, ...others] = locales;
  if (first && known(first.languageCode)) return first.languageCode;
  if (first?.regionCode === 'UA' && supported.includes('uk')) return 'uk';
  for (const locale of others) {
    if (known(locale.languageCode)) return locale.languageCode;
  }
  return 'en';
}

/**
 * The language of the phone, asked once. English where this build cannot ask (it was made before `expo-localization` was added,
 * see NATIVE_LOCALIZATION).
 */
export async function detectLanguage(supported: readonly Language[]): Promise<Language> {
  if (!hasNativeModule(NATIVE_LOCALIZATION)) return 'en';
  try {
    const { getLocales } = await import('expo-localization');
    return pickLanguage(getLocales(), supported);
  } catch {
    return 'en';
  }
}
