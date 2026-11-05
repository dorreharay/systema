import { useEffect, useMemo, useSyncExternalStore, type ReactNode } from 'react';
import { AppState } from 'react-native';

import { useAuth } from '@/lib/auth';

import { bindSession, engine, offlineStore } from './app';
import type { Snapshot } from './store';
import type { Mark } from './types';

/** The offline store as React reads it: a component draws again when anything in it changes. */
export function useSnapshot(): Snapshot {
  return useSyncExternalStore(offlineStore.subscribe, offlineStore.getSnapshot, offlineStore.getSnapshot);
}

export type SyncSummary = {
  // Whether the server was reachable the last time it was asked.
  online: boolean;
  syncing: boolean;
  // Changes that wait to be sent.
  waiting: number;
  // Changes the server refused, which need the stringer.
  failed: number;
  // Changes that wait for one the server refused.
  blocked: number;
  lastSyncAt: string | null;
  // Everything that has not reached the server.
  unsynced: number;
};

/** How the queue stands, for the mark in the header, the screen of the queue and the warning before signing out. */
export function useSyncSummary(): SyncSummary {
  const { outbox, blocked, net } = useSnapshot();
  return useMemo(() => {
    const failed = outbox.filter((op) => op.failure).length;
    const stuck = outbox.filter((op) => !op.failure && blocked.has(op.id)).length;
    return {
      online: net.online,
      syncing: net.syncing,
      waiting: outbox.length - failed - stuck,
      failed,
      blocked: stuck,
      lastSyncAt: net.lastSyncAt,
      unsynced: outbox.length,
    };
  }, [outbox, blocked, net]);
}

/** Whether something is waiting at the server for this order, client, racket...: not sent yet, not accepted, or waiting for one that was not. */
export function useMark(id: string | undefined): Mark | undefined {
  // Only the mark is watched: a card is drawn again when its own mark changes, not with every change of the queue.
  return useSyncExternalStore(offlineStore.subscribe, () => offlineStore.getSnapshot().marks.get(id ?? ''));
}

/**
 * Starts the offline layer for whoever is signed in: reads their saved data, sends what is waiting, and keeps the phone and the
 * server in step while the app is in front. Renders nothing of its own.
 */
export function OfflineProvider({ children }: { children: ReactNode }) {
  const { status, user, token, endSession } = useAuth();
  const userId = status === 'signedIn' ? user?.id : undefined;

  // What the engine sends with, and what it does when the server says the session is over.
  useEffect(() => {
    bindSession({ token, onEnded: endSession });
  }, [token, endSession]);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    void offlineStore.open(userId).then(() => {
      if (!cancelled) engine.start();
    });
    return () => {
      cancelled = true;
      engine.stop();
      // What is unsent stays in its file: the same person may sign in again.
      void offlineStore.close();
    };
  }, [userId]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') engine.resume();
      else void offlineStore.flush();
    });
    return () => subscription.remove();
  }, []);

  return children;
}
