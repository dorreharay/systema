import de from './de.js';
import en from './en.js';
import es from './es.js';
import fr from './fr.js';
import it from './it.js';
import ja from './ja.js';
import pl from './pl.js';
import pt from './pt.js';
import uk from './uk.js';

/** The languages of the app, in the order the app lists them (see src/lib/i18n/index.tsx). */
export const LANGUAGES = ['en', 'de', 'fr', 'es', 'it', 'pt', 'ja', 'uk', 'pl'];

const MESSAGES = { en, de, fr, es, it, pt, ja, uk, pl };

/** The texts of a language: the password reset email and the page behind its link. English for a language the server does not know. */
export const messagesFor = (language) => MESSAGES[language] ?? MESSAGES.en;

/** `text` with each `{word}` replaced by `values.word`; a word that has no value stays as it is. */
export const fill = (text, values) =>
  text.replace(/\{(\w+)\}/g, (match, word) => (word in values ? String(values[word]) : match));
