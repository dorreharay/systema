import { keepPreviousData, useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useCallback, useMemo, useState } from 'react';

import { api, apiBlob, type RequestOptions } from '@/lib/api';
import { ApiError } from '@/lib/api-error';
import { useAuth } from '@/lib/auth';
import { engine, offlineActions } from '@/lib/offline/app';
import type { ClientInput, RacketInput, ServiceInput, StringInput } from '@/lib/offline/inputs';
import { useSnapshot } from '@/lib/offline/react';
import {
  selectClient,
  selectClients,
  selectDashboard,
  selectOrder,
  selectOrders,
  selectRacket,
  selectRackets,
  selectServices,
  selectStrings,
  type OrderFilter,
  type RacketFilter,
} from '@/lib/offline/select';
import type { Tables } from '@/lib/offline/types';
import type {
  Insights,
  OrderInput,
  ReferenceRacket,
  ReferenceString,
} from '@/lib/types';

export type { ClientInput, OrderFilter, RacketFilter, RacketInput, ServiceInput, StringInput };

// How many orders the list shows at a time; the next page is shown when the end of it is near.
const ORDERS_PAGE = 20;

/** `api()` with the signed-in person's token. For what only the server can answer (the reference list, a photo). */
export function useRequest() {
  const { token } = useAuth();
  return useCallback(
    <T>(path: string, options?: Omit<RequestOptions, 'token'>) => api<T>(path, { ...options, token }),
    [token]
  );
}

// --- Reading ---------------------------------------------------------------------------------
//
// Everything the stringer works with is read from the copy of their data that the phone keeps (see lib/offline): the same
// whether there is a connection or not, and at once. These hooks answer in the shape of a query, so that the screens do not
// have to know.

const NOT_FOUND = new ApiError(404, 'Not found');
const UNREACHABLE = new ApiError(0, 'The server could not be reached', 'network');
const UNAVAILABLE = new ApiError(503, 'The server is not answering');

type Read<T> = {
  data: T | undefined;
  isLoading: boolean;
  isPending: boolean;
  isError: boolean;
  error: unknown;
  isFetching: boolean;
  /** Asks the server for its data again (the pull to refresh). */
  refetch: () => Promise<unknown>;
};

const refetch = () => engine.syncNow({ pull: true });

/**
 * Reads something from the copy. `data` is empty until the phone has the server's data for the first time (then `isLoading`,
 * or `isError` when that cannot be had); a thing that is asked for by its id and is not there is an error too (`missing`).
 */
function useRead<T>(
  select: (tables: Tables) => T | undefined,
  // What `select` depends on besides the tables, as one string: the answer is worked out again when it changes.
  key: string,
  { enabled = true, missing = false }: { enabled?: boolean; missing?: boolean } = {}
): Read<T> {
  const snapshot = useSnapshot();
  const loaded = snapshot.ready && snapshot.hasData;
  const data = useMemo(
    () => (enabled && loaded ? select(snapshot.tables) : undefined),
    // `select` depends on `key` only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [snapshot.tables, loaded, enabled, key]
  );

  // Nothing to show and nothing coming: the first read of the server's data was tried and failed.
  const failed = enabled && snapshot.ready && !snapshot.hasData && snapshot.net.settled && !snapshot.net.syncing;
  const gone = enabled && missing && loaded && data === undefined;
  const isError = failed || gone;
  return {
    data,
    isLoading: enabled && !loaded && !failed,
    isPending: enabled && data === undefined && !isError,
    isError,
    error: failed ? (snapshot.net.online ? UNAVAILABLE : UNREACHABLE) : gone ? NOT_FOUND : null,
    isFetching: snapshot.net.syncing,
    refetch,
  };
}

export const useDashboard = () => {
  const { user } = useAuth();
  return useRead((tables) => selectDashboard(tables, user?.timezone, Date.now()), user?.timezone ?? '');
};

/** The charts of the home screen, as the server last drew them: they are not worked out on the phone. `at` is when. */
export const useInsights = (): Read<Insights> & { at: string | null } => {
  const { meta, ready, hasData, net } = useSnapshot();
  const data = meta?.insights?.data;
  const failed = ready && !data && net.settled && !net.syncing;
  return {
    data,
    at: meta?.insights?.at ?? null,
    isLoading: !data && !failed,
    isPending: !data && !failed,
    isError: failed && !hasData,
    error: net.online ? UNAVAILABLE : UNREACHABLE,
    isFetching: net.syncing,
    refetch,
  };
};

export function useOrders({ status, q = '', clientId }: OrderFilter) {
  const text = q.trim();
  const key = `${status ?? ''}|${text}|${clientId ?? ''}`;
  const all = useRead((tables) => selectOrders(tables, { status, q: text, clientId }), key);
  const [shown, setShown] = useState({ key, count: 1 });
  // A new filter starts from the first page again.
  const count = shown.key === key ? shown.count : 1;

  const data = useMemo(() => {
    const items = all.data;
    if (!items) return undefined;
    const pages = Array.from({ length: count }, (_, index) => ({
      items: items.slice(index * ORDERS_PAGE, (index + 1) * ORDERS_PAGE),
      has_more: items.length > (index + 1) * ORDERS_PAGE,
    }));
    return { pages, pageParams: pages.map((_, index) => index * ORDERS_PAGE) };
  }, [all.data, count]);

  return {
    ...all,
    data,
    hasNextPage: !!all.data && all.data.length > count * ORDERS_PAGE,
    isFetchingNextPage: false,
    fetchNextPage: () => {
      setShown({ key, count: count + 1 });
      return Promise.resolve();
    },
  };
}

/** Every order that fits the words typed, in the order of the queue: for a table that shows them all, and counts them. */
export const useAllOrders = (q = '') => useRead((tables) => selectOrders(tables, { q }), q.trim());

/** The orders that are still to be done, for the reminders on the phone. */
export const useActiveOrders = () => useRead((tables) => selectOrders(tables, { status: 'active' }), '');

export const useOrder = (id: string | undefined) =>
  useRead((tables) => selectOrder(tables, id), id ?? '', { enabled: !!id, missing: true });

export const useClients = (q = '') => useRead((tables) => selectClients(tables, q), q.trim());

export const useClient = (id: string | undefined) =>
  useRead((tables) => selectClient(tables, id), id ?? '', { enabled: !!id, missing: true });

export const useRackets = ({ q = '', clientId, kind, inStock, enabled = true }: RacketFilter & { enabled?: boolean } = {}) =>
  useRead((tables) => selectRackets(tables, { q, clientId, kind, inStock }), `${q.trim()}|${clientId}|${kind}|${inStock}`, { enabled });

export const useRacket = (id: string | undefined) =>
  useRead((tables) => selectRacket(tables, id), id ?? '', { enabled: !!id, missing: true });

export const useStrings = (q = '', { inStock, enabled = true }: { inStock?: boolean; enabled?: boolean } = {}) =>
  useRead((tables) => selectStrings(tables, q, inStock), `${q.trim()}|${inStock}`, { enabled });

export const useServices = (q = '') => useRead((tables) => selectServices(tables, q), q.trim());

/** Whether the server was reachable the last time it was asked: what only it can answer (the reference list) needs it. */
export const useOnline = () => useSnapshot().net.online;

// The reference list: the rackets and strings that exist, found by a part of the name while a new one is typed.
// It is the same for everyone and does not change while the app is open, so an answer is kept for a while. It is the one
// thing here that only the server has: without a connection it is not offered, and the name is typed.
const REFERENCE_STALE_MS = 60 * 60_000;
// How many are asked for: more than a form shows, since what the catalog already has is taken out of them.
const REFERENCE_FETCH = 12;

function useReference<T>(kind: 'rackets' | 'strings', q: string, enabled: boolean, limit: number) {
  const request = useRequest();
  const online = useOnline();
  const text = q.trim();
  return useQuery({
    queryKey: ['reference', kind, text, limit],
    queryFn: () =>
      request<{ items: T[] }>(`/api/reference/${kind}?q=${encodeURIComponent(text)}&limit=${limit}`),
    // One letter finds too much to be of use.
    enabled: enabled && online && text.length >= 2,
    staleTime: REFERENCE_STALE_MS,
    placeholderData: keepPreviousData,
    select: (data) => data.items,
  });
}

export const useReferenceRackets = (q: string, enabled = true) =>
  useReference<ReferenceRacket>('rackets', q, enabled, REFERENCE_FETCH);

export const useReferenceStrings = (q: string, enabled = true) =>
  useReference<ReferenceString>('strings', q, enabled, REFERENCE_FETCH);

// How many of the reference rackets a picker that lists all of them asks for at a time; the next page is asked for when
// the end of it is near.
const REFERENCE_PAGE = 30;

/** The reference rackets a page at a time, all of them or the ones that fit what is typed: for a picker to scroll through. */
export function useReferenceRacketPages(q: string, enabled = true) {
  const request = useRequest();
  const online = useOnline();
  const text = q.trim();
  return useInfiniteQuery({
    queryKey: ['reference', 'racket-pages', text],
    enabled: enabled && online,
    initialPageParam: 0,
    queryFn: ({ pageParam }) =>
      request<{ items: ReferenceRacket[]; has_more: boolean }>(
        `/api/reference/rackets?q=${encodeURIComponent(text)}&limit=${REFERENCE_PAGE}&offset=${pageParam}`
      ),
    getNextPageParam: (last, pages) => (last.has_more ? pages.length * REFERENCE_PAGE : undefined),
    staleTime: REFERENCE_STALE_MS,
    // While a search is being typed the previous results stay up instead of flashing empty.
    placeholderData: keepPreviousData,
  });
}

/** The lists of rackets and strings, read again: for when the server says that what they show is out of date (what ran out, or is gone). */
export function useRefreshCatalog() {
  return () => void engine.syncNow({ pull: true });
}

function blobToDataUri(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/** An order photo, as an image address. A photo never changes, so it is loaded once. Photos need a connection. */
export function usePhotoUri(id: string) {
  const { token } = useAuth();
  return useQuery({
    queryKey: ['photo', id],
    queryFn: async () => blobToDataUri(await apiBlob(`/api/photos/${id}`, token)),
    staleTime: Infinity,
    gcTime: 10 * 60_000,
  });
}

// --- Writing ---------------------------------------------------------------------------------
//
// A change is put in the queue of the phone and shows at once; the engine takes it to the server when it can (see
// lib/offline/actions). The hooks keep the shape of a mutation that the screens use.

function useAction<Vars, Result>(run: (vars: Vars) => Promise<Result>) {
  const [state, setState] = useState<{ isPending: boolean; variables: Vars | undefined }>({
    isPending: false,
    variables: undefined,
  });
  const mutateAsync = useCallback(
    async (variables: Vars) => {
      setState({ isPending: true, variables });
      try {
        return await run(variables);
      } finally {
        setState((current) => ({ ...current, isPending: false }));
      }
    },
    [run]
  );
  return {
    mutateAsync,
    mutate: (variables: Vars) => void mutateAsync(variables).catch(() => undefined),
    isPending: state.isPending,
    variables: state.variables,
  };
}

const createOrder = (input: OrderInput) => offlineActions.createOrder(input);
const updateOrder = ({ id, ...input }: OrderInput & { id: string }) => offlineActions.updateOrder(id, input);
const deleteOrder = (id: string) => offlineActions.deleteOrder(id);
const createClient = (input: ClientInput) => offlineActions.createClient(input);
const updateClient = ({ id, ...input }: ClientInput & { id: string }) => offlineActions.updateClient(id, input);
const deleteClient = (id: string) => offlineActions.deleteClient(id);
const createRacket = (input: RacketInput) => offlineActions.createRacket(input);
const updateRacket = ({ id, ...input }: RacketInput & { id: string }) => offlineActions.updateRacket(id, input);
const deleteRacket = (id: string) => offlineActions.deleteRacket(id);
const createString = (input: StringInput) => offlineActions.createString(input);
const updateString = ({ id, ...input }: StringInput & { id: string }) => offlineActions.updateString(id, input);
const deleteString = (id: string) => offlineActions.deleteString(id);
const createService = (input: ServiceInput) => offlineActions.createService(input);
const updateService = ({ id, ...input }: ServiceInput & { id: string }) => offlineActions.updateService(id, input);
const deletePhoto = (id: string) => offlineActions.deletePhoto(id);

export const useCreateOrder = () => useAction(createOrder);
export const useUpdateOrder = () => useAction(updateOrder);
export const useDeleteOrder = () => useAction(deleteOrder);
export const useCreateClient = () => useAction(createClient);
export const useUpdateClient = () => useAction(updateClient);
export const useDeleteClient = () => useAction(deleteClient);
export const useCreateRacket = () => useAction(createRacket);
export const useUpdateRacket = () => useAction(updateRacket);
export const useDeleteRacket = () => useAction(deleteRacket);
export const useCreateString = () => useAction(createString);
export const useUpdateString = () => useAction(updateString);
export const useDeleteString = () => useAction(deleteString);
export const useCreateService = () => useAction(createService);
export const useUpdateService = () => useAction(updateService);
export const useDeletePhoto = () => useAction(deletePhoto);
