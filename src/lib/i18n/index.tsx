import { createContext, use, useEffect, useRef, useState, type ReactNode } from 'react';

import { useAuth } from '@/lib/auth';
import { getItem, removeItem, setItem } from '@/lib/local-storage';

import { de } from './de';
import { detectLanguage } from './detect';
import { en } from './en';
import { es } from './es';
import { fr } from './fr';
import { it } from './it';
import { ja } from './ja';
import { pl } from './pl';
import { pt } from './pt';
import { uk } from './uk';

export type Language = 'en' | 'de' | 'fr' | 'es' | 'it' | 'pt' | 'ja' | 'uk' | 'pl';
export type TKey = keyof typeof en;
export type TParams = Record<string, string | number>;
export type Translate = (key: TKey, params?: TParams) => string;

// Each language is named in itself, as a person who does not read the screen will look for it.
export const LANGUAGES: { code: Language; label: string }[] = [
  { code: 'en', label: 'English' },
  { code: 'de', label: 'Deutsch' },
  { code: 'fr', label: 'Français' },
  { code: 'es', label: 'Español' },
  { code: 'it', label: 'Italiano' },
  { code: 'pt', label: 'Português' },
  { code: 'ja', label: '日本語' },
  { code: 'uk', label: 'Українська' },
  { code: 'pl', label: 'Polski' },
];

const DICTIONARIES: Record<Language, Record<string, string>> = { en, de, fr, es, it, pt, ja, uk, pl };
const STORAGE_KEY = 'language';
// The language chosen while nobody was signed in, kept until an account has it (see I18nProvider).
const CHOSEN_KEY = 'language_chosen';

const isLanguage = (value: unknown): value is Language => LANGUAGES.some((item) => item.code === value);

/**
 * Which form of a word goes with a number: "1 racket", "2 rackets"; "1 ракетка", "2 ракетки", "5 ракеток" (Polish has the same
 * three forms); French and Portuguese call 0 and 1 singular; Japanese has one form. The forms are the plural categories of the
 * CLDR; a dictionary has `<key>_<category>` for each it needs, and the plain key for the rest.
 */
function pluralCategory(language: Language, count: number) {
  const mod10 = count % 10;
  const mod100 = count % 100;
  switch (language) {
    case 'uk':
      if (mod10 === 1 && mod100 !== 11) return 'one';
      if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'few';
      return 'many';
    case 'pl':
      if (count === 1) return 'one';
      if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'few';
      return 'many';
    case 'fr':
    case 'pt':
      return count === 0 || count === 1 ? 'one' : 'other';
    case 'ja':
      return 'other';
    default:
      return count === 1 ? 'one' : 'other';
  }
}

/**
 * The text for a key in a language, with `{name}` filled in from `params`. With a `count`, the form
 * for that number is used (`rackets_one`, `rackets_few`...) when the dictionary has one.
 */
export function translate(language: Language, key: TKey, params?: TParams) {
  const dictionary = DICTIONARIES[language];
  const variant =
    typeof params?.count === 'number'
      ? dictionary[`${key}_${pluralCategory(language, params.count)}`]
      : undefined;
  const template = variant ?? dictionary[key] ?? en[key] ?? key;
  return template.replace(/\{(\w+)\}/g, (match, name: string) => String(params?.[name] ?? match));
}

type I18nContextValue = {
  language: Language;
  setLanguage: (language: Language) => void;
  t: Translate;
};

const I18nContext = createContext<I18nContextValue | null>(null);

export function useI18n() {
  const value = use(I18nContext);
  if (!value) {
    throw new Error('useI18n must be used inside <I18nProvider>');
  }
  return value;
}

/**
 * Before anyone signs in the language is the one last used on this device; where none has been chosen yet it is the language
 * of the phone (English, for a language the app does not have), and it is not kept, so it follows the phone until a choice is
 * made. Once signed in it is the one saved in the account, unless the person chose another on the welcome screen: that one is
 * not given up for the account's, it is saved to the account they sign in to, as if it had been chosen in Settings.
 */
export function I18nProvider({ children }: { children: ReactNode }) {
  const { user, updateProfile } = useAuth();
  const [language, setLanguageState] = useState<Language>('en');
  const [loaded, setLoaded] = useState(false);
  // The language chosen with nobody signed in. It is kept on the device until an account has it, so that closing the app
  // before signing in does not lose it.
  const [chosen, setChosen] = useState<Language | null>(null);
  const accountLanguage = user?.language;
  const [adopted, setAdopted] = useState<Language | undefined>(undefined);
  // The language of the phone is only a first guess: it is not taken once the person, or their account, has said which they want.
  const mayDetect = useRef(true);

  // The language saved in the account wins once there is one (signing in, or saving a change), except over one chosen on the
  // welcome screen: that stays, and the effect below gives it to the account.
  if (loaded && accountLanguage !== adopted) {
    setAdopted(accountLanguage);
    if (isLanguage(accountLanguage)) {
      if (!chosen || chosen === accountLanguage) setLanguageState(accountLanguage);
      // The account has it now.
      if (chosen === accountLanguage) setChosen(null);
    }
  }

  useEffect(() => {
    Promise.all([getItem(STORAGE_KEY), getItem(CHOSEN_KEY)]).then(async ([saved, picked]) => {
      if (isLanguage(picked)) {
        setChosen(picked);
        setLanguageState(picked);
      } else if (isLanguage(saved)) {
        setLanguageState(saved);
      } else {
        const detected = await detectLanguage(LANGUAGES.map((item) => item.code));
        if (mayDetect.current) setLanguageState(detected);
      }
      setLoaded(true);
    });
  }, []);

  useEffect(() => {
    if (isLanguage(accountLanguage)) {
      mayDetect.current = false;
      // Until the account has the language that was chosen, this device stays in the chosen one.
      if (!chosen || chosen === accountLanguage) setItem(STORAGE_KEY, accountLanguage);
    }
  }, [accountLanguage, chosen]);

  useEffect(() => {
    if (!loaded) return;
    if (chosen) setItem(CHOSEN_KEY, chosen);
    else removeItem(CHOSEN_KEY);
  }, [loaded, chosen]);

  // The account signed in to has another language than the one chosen on the welcome screen: it is given that one. When that
  // cannot be done now (no connection), the choice is kept and it is tried again at the next start.
  useEffect(() => {
    if (!loaded || !chosen || !isLanguage(accountLanguage) || accountLanguage === chosen) return;
    updateProfile({ language: chosen }).catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, chosen, accountLanguage]);

  // The splash screen is still up until this has rendered, so the first frame is in the right language.
  if (!loaded) {
    return null;
  }

  const value: I18nContextValue = {
    language,
    setLanguage: (next) => {
      mayDetect.current = false;
      setLanguageState(next);
      setItem(STORAGE_KEY, next);
      // With nobody signed in it is the choice the next sign-in keeps; signed in (Settings), the account gets it at once.
      setChosen(user ? null : next);
    },
    t: (key, params) => translate(language, key, params),
  };

  return <I18nContext value={value}>{children}</I18nContext>;
}
