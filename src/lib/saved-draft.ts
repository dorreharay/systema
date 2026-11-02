/**
 * The draft of an order that is not finished, kept on the device. What is typed into the order form is saved
 * as it goes, and comes back when the form is opened again; saving the order, or starting over, removes it.
 */
import { useEffect, useState } from 'react';

import { pictureExists, readDraftFile, removeDraftFile, writeDraftFile } from '@/lib/draft-storage';
import type { Draft } from '@/lib/order-draft';

// Changes when what is saved can no longer be read by the form: older drafts are then left behind.
const VERSION = 1;

export type SavedDraft = {
  draft: Draft;
  // Pictures of the order, on the server, that were taken off it in the form.
  removedPhotos: string[];
};

export function saveDraft(key: string, draft: Draft, removedPhotos: string[]) {
  return writeDraftFile(key, JSON.stringify({ v: VERSION, draft, removedPhotos }));
}

export const clearSavedDraft = removeDraftFile;

async function loadSavedDraft(key: string): Promise<SavedDraft | null> {
  const text = await readDraftFile(key);
  if (!text) return null;
  try {
    const saved = JSON.parse(text) as { v?: number; draft?: Draft; removedPhotos?: string[] };
    if (saved.v !== VERSION || !saved.draft || typeof saved.draft !== 'object') return null;
    return {
      // A picture that is gone from the phone is left out.
      draft: { ...saved.draft, photos: (saved.draft.photos ?? []).filter((photo) => pictureExists(photo.uri)) },
      removedPhotos: saved.removedPhotos ?? [],
    };
  } catch {
    return null;
  }
}

/** The draft saved under `key`, once it has been read: `loading` until then, and `saved` is null when there is none. */
export function useSavedDraft(key: string) {
  const [loaded, setLoaded] = useState<{ key: string; saved: SavedDraft | null } | null>(null);

  useEffect(() => {
    let current = true;
    void loadSavedDraft(key).then((saved) => {
      if (current) setLoaded({ key, saved });
    });
    return () => {
      current = false;
    };
  }, [key]);

  return loaded?.key === key ? { loading: false, saved: loaded.saved } : { loading: true, saved: null };
}
