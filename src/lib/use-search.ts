import { useState } from 'react';

import { useDebounced } from '@/lib/use-debounced';

// How long a list waits after a key for the next one before it is filtered again: a list of a few thousand orders is not
// drawn again at every letter of a name.
const SEARCH_DEBOUNCE_MS = 250;

/**
 * What a list that is searched keeps (with `SearchField`, ui/search-field.tsx). `text` is what is typed: the field shows it at
 * once. `query` is what the list is filtered by: it follows the text after a pause in typing, and at once when the field is
 * emptied (the clear button, the Esc key), so that the whole list is back without a wait. It has no space at either end.
 */
export function useSearch(ms = SEARCH_DEBOUNCE_MS) {
  const [text, setText] = useState('');
  const settled = useDebounced(text, text ? ms : 0);
  const query = (text ? settled : '').trim();

  return { text, setText, query, clear: () => setText('') };
}
