import { openUrl } from '@/lib/contact';
import type { Language } from '@/lib/i18n';

const SITE = 'https://tryrestring.com';

export type LegalPage = 'privacy' | 'terms';

/** The public page of a legal text in the language of the app: Ukrainian at /privacy/, English at /en/privacy/. */
export const legalUrl = (page: LegalPage, language: Language) => `${SITE}${language === 'uk' ? '' : '/en'}/${page}/`;

/** Opens the page in the browser. Returns false when the device cannot. */
export const openLegalPage = (page: LegalPage, language: Language) => openUrl(legalUrl(page, language));
