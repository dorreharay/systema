import { useEffect, useMemo, useRef, useSyncExternalStore, type ReactNode } from 'react';
import { AppState } from 'react-native';

import { useAuth } from '@/lib/auth';
import { emailConfirmed } from '@/lib/auth-api';
import { orderCapOf, stockOnOf } from '@/lib/subscription';

import { bindPlan, bindSelf, bindSession, engine, offlineStore } from './app';
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
  // An account that has not confirmed its email address has nothing to read or send yet: the server turns it away from all of it.
  const userId = status === 'signedIn' && emailConfirmed(user) ? user?.id : undefined;

  // What the engine sends with, and what it does when the server says the session is over.
  useEffect(() => {
    bindSession({ token, onEnded: endSession });
  }, [token, endSession]);

  // What the plan of the account allows: the limit of new orders in a month and whether the stock is counted, asked again each time an
  // order is made (the clock moves on: a phone that stays away from the server for long stops counting on a paid plan).
  const subscription = status === 'signedIn' ? user?.subscription : undefined;
  const timeZone = status === 'signedIn' ? user?.timezone : undefined;
  useEffect(() => {
    bindPlan({
      orderCap: () => orderCapOf(subscription, timeZone, Date.now()),
      stockOn: () => stockOnOf(subscription, Date.now()),
    });
    return () => bindPlan(null);
  }, [subscription, timeZone]);

  // Who is working and in what role: a master's order is theirs, a receptionist's goes to the queue (see lib/workshop.ts). Only in a workshop
  // that has a team do the orders have a performer at all.
  const workshop = status === 'signedIn' ? user?.workshop : undefined;
  const me = status === 'signedIn' && user ? { id: user.id, name: user.full_name?.trim() || user.email.split('@')[0] } : null;
  const meId = me?.id;
  const meName = me?.name;
  const role = workshop?.role;
  const teamed = workshop?.team === true;
  useEffect(() => {
    bindSelf(teamed && role && meId && meName ? { person: { id: meId, name: meName }, role } : null);
    return () => bindSelf(null);
  }, [teamed, role, meId, meName]);

  // What the screens see is a workshop's data, and which workshop it is changes when the person joins one or leaves it: the data is read again.
  const ownerId = workshop?.owner_id;
  const lastOwner = useRef(ownerId);
  useEffect(() => {
    if (lastOwner.current === ownerId) return;
    lastOwner.current = ownerId;
    if (userId) void engine.syncNow({ pull: true });
  }, [ownerId, userId]);

  // The server shows the catalog as counted or not by the plan (backend `stockTracked`), so when the plan changes the data is read again: the
  // stock comes back (or goes) at once, and not at the next read in five minutes.
  const plan = subscription?.plan;
  const lastPlan = useRef(plan);
  useEffect(() => {
    if (lastPlan.current === plan) return;
    lastPlan.current = plan;
    if (userId) void engine.syncNow({ pull: true });
  }, [plan, userId]);

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
