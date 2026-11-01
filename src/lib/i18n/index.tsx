import { createContext, use, useEffect, useState, type ReactNode } from 'react';

import { useAuth } from '@/lib/auth';
import { getItem, setItem } from '@/lib/local-storage';

import { en } from './en';
import { uk } from './uk';

export type Language = 'en' | 'uk';
export type TKey = keyof typeof en;
export type TParams = Record<string, string | number>;
export type Translate = (key: TKey, params?: TParams) => string;

export const LANGUAGES: { code: Language; label: string }[] = [
  { code: 'en', label: 'English' },
  { code: 'uk', label: 'Українська' },
];

const DICTIONARIES: Record<Language, Record<string, string>> = { en, uk };
const STORAGE_KEY = 'language';

const isLanguage = (value: unknown): value is Language => value === 'en' || value === 'uk';

/** Which form of a word goes with a number: "1 racket", "2 rackets"; "1 ракетка", "2 ракетки", "5 ракеток". */
function pluralCategory(language: Language, count: number) {
  if (language === 'uk') {
    const mod10 = count % 10;
    const mod100 = count % 100;
    if (mod10 === 1 && mod100 !== 11) return 'one';
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'few';
    return 'many';
  }
  return count === 1 ? 'one' : 'other';
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
 * English until told otherwise. Before anyone signs in the language is the one last used on this
 * device; once signed in it is the one saved in the account.
 */
export function I18nProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [language, setLanguageState] = useState<Language>('en');
  const [loaded, setLoaded] = useState(false);
  const accountLanguage = user?.language;
  const [adopted, setAdopted] = useState<Language | undefined>(undefined);

  // The language saved in the account wins once there is one (signing in, or saving a change).
  if (accountLanguage !== adopted) {
    setAdopted(accountLanguage);
    if (isLanguage(accountLanguage)) setLanguageState(accountLanguage);
  }

  useEffect(() => {
    getItem(STORAGE_KEY).then((saved) => {
      if (isLanguage(saved)) setLanguageState(saved);
      setLoaded(true);
    });
  }, []);

  useEffect(() => {
    if (isLanguage(accountLanguage)) setItem(STORAGE_KEY, accountLanguage);
  }, [accountLanguage]);

  // The splash screen is still up until this has rendered, so the first frame is in the right language.
  if (!loaded) {
    return null;
  }

  const value: I18nContextValue = {
    language,
    setLanguage: (next) => {
      setLanguageState(next);
      setItem(STORAGE_KEY, next);
    },
    t: (key, params) => translate(language, key, params),
  };

  return <I18nContext value={value}>{children}</I18nContext>;
}
