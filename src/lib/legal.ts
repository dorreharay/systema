import { openUrl } from '@/lib/contact';
import type { Language } from '@/lib/i18n';

const SITE = 'https://tryrestring.com';

export type LegalPage = 'privacy' | 'terms';

/**
 * The public page of a legal text in the language of the app: Ukrainian is the root of the site (/privacy/), every other language has
 * a folder named by its code (/en/privacy/, /de/privacy/, ...).
 */
export const legalUrl = (page: LegalPage, language: Language) => `${SITE}${language === 'uk' ? '' : `/${language}`}/${page}/`;

/** Opens the page in the browser. Returns false when the device cannot. */
export const openLegalPage = (page: LegalPage, language: Language) => openUrl(legalUrl(page, language));
