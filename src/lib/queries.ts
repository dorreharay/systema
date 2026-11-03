import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { useCallback } from 'react';

import { api, apiBlob, type RequestOptions } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import type {
  CatalogString,
  Client,
  ClientDetail,
  Dashboard,
  Insights,
  Order,
  OrderDetail,
  OrderInput,
  OrderStatus,
  Racket,
  RacketDetail,
  ReferenceRacket,
  ReferenceString,
  Service,
  StringType,
} from '@/lib/types';

// How many orders the list asks for at a time; the next page is asked for when the end of it is near.
const ORDERS_PAGE = 20;

/** `api()` with the signed-in person's token. */
export function useRequest() {
  const { token } = useAuth();
  return useCallback(
    <T>(path: string, options?: Omit<RequestOptions, 'token'>) => api<T>(path, { ...options, token }),
    [token]
  );
}
type Request = ReturnType<typeof useRequest>;

const search = (q: string) => (q.trim() ? `?q=${encodeURIComponent(q.trim())}` : '');

// --- Reading ---------------------------------------------------------------------------------

export const useDashboard = () => {
  const request = useRequest();
  return useQuery({ queryKey: ['dashboard'], queryFn: () => request<Dashboard>('/api/dashboard') });
};

export const useInsights = () => {
  const request = useRequest();
  return useQuery({ queryKey: ['insights'], queryFn: () => request<Insights>('/api/insights') });
};

export type OrderFilter = { status?: OrderStatus | 'active'; q?: string; clientId?: string };

export function useOrders({ status, q = '', clientId }: OrderFilter) {
  const request = useRequest();
  return useInfiniteQuery({
    queryKey: ['orders', { status, q: q.trim(), clientId }],
    initialPageParam: 0,
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams({ limit: String(ORDERS_PAGE), offset: String(pageParam) });
      if (status) params.set('status', status);
      if (q.trim()) params.set('q', q.trim());
      if (clientId) params.set('client_id', clientId);
      return request<{ items: Order[]; has_more: boolean }>(`/api/orders?${params}`);
    },
    getNextPageParam: (last, pages) => (last.has_more ? pages.length * ORDERS_PAGE : undefined),
    // While a search is being typed the previous results stay up instead of flashing empty.
    placeholderData: keepPreviousData,
  });
}

export const useOrder = (id: string | undefined) => {
  const request = useRequest();
  return useQuery({
    queryKey: ['order', id],
    queryFn: () => request<OrderDetail>(`/api/orders/${id}`),
    enabled: !!id,
  });
};

export const useClients = (q = '') => {
  const request = useRequest();
  return useQuery({
    queryKey: ['clients', q.trim()],
    queryFn: () => request<{ items: Client[] }>(`/api/clients${search(q)}`),
    placeholderData: keepPreviousData,
    select: (data) => data.items,
  });
};

export const useClient = (id: string | undefined) => {
  const request = useRequest();
  return useQuery({
    queryKey: ['client', id],
    queryFn: () => request<ClientDetail>(`/api/clients/${id}`),
    enabled: !!id,
  });
};

export type RacketFilter = {
  q?: string;
  clientId?: string;
  // The rackets of clients, or the catalog's (the ones kept in stock).
  kind?: 'client' | 'catalog';
  inStock?: boolean;
  // False while the list is not wanted: it is asked for once it is.
  enabled?: boolean;
};

export const useRackets = ({ q = '', clientId, kind, inStock, enabled = true }: RacketFilter = {}) => {
  const request = useRequest();
  return useQuery({
    queryKey: ['rackets', { q: q.trim(), clientId, kind, inStock }],
    enabled,
    queryFn: () => {
      const params = new URLSearchParams();
      if (q.trim()) params.set('q', q.trim());
      if (clientId) params.set('client_id', clientId);
      if (kind) params.set('kind', kind);
      if (inStock) params.set('in_stock', '1');
      const query = params.toString();
      return request<{ items: Racket[] }>(`/api/rackets${query ? `?${query}` : ''}`);
    },
    placeholderData: keepPreviousData,
    select: (data) => data.items,
  });
};

export const useRacket = (id: string | undefined) => {
  const request = useRequest();
  return useQuery({
    queryKey: ['racket', id],
    queryFn: () => request<RacketDetail>(`/api/rackets/${id}`),
    enabled: !!id,
  });
};

export const useStrings = (q = '', { inStock, enabled = true }: { inStock?: boolean; enabled?: boolean } = {}) => {
  const request = useRequest();
  return useQuery({
    queryKey: ['strings', q.trim(), inStock],
    enabled,
    queryFn: () => {
      const params = new URLSearchParams();
      if (q.trim()) params.set('q', q.trim());
      if (inStock) params.set('in_stock', '1');
      const query = params.toString();
      return request<{ items: CatalogString[] }>(`/api/strings${query ? `?${query}` : ''}`);
    },
    placeholderData: keepPreviousData,
    select: (data) => data.items,
  });
};

// The reference list: the rackets and strings that exist, found by a part of the name while a new one is typed.
// It is the same for everyone and does not change while the app is open, so an answer is kept for a while.
const REFERENCE_STALE_MS = 60 * 60_000;
// How many are asked for: more than a form shows, since what the catalog already has is taken out of them.
const REFERENCE_FETCH = 12;

function useReference<T>(kind: 'rackets' | 'strings', q: string, enabled: boolean, limit: number) {
  const request = useRequest();
  const text = q.trim();
  return useQuery({
    queryKey: ['reference', kind, text, limit],
    queryFn: () =>
      request<{ items: T[] }>(`/api/reference/${kind}?q=${encodeURIComponent(text)}&limit=${limit}`),
    // One letter finds too much to be of use.
    enabled: enabled && text.length >= 2,
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
  const text = q.trim();
  return useInfiniteQuery({
    queryKey: ['reference', 'racket-pages', text],
    enabled,
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
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: ['rackets'] });
    void queryClient.invalidateQueries({ queryKey: ['strings'] });
  };
}

export const useServices = () => {
  const request = useRequest();
  return useQuery({
    queryKey: ['services'],
    queryFn: () => request<{ items: Service[] }>('/api/services'),
    select: (data) => data.items,
  });
};

function blobToDataUri(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/** An order photo, as an image address. A photo never changes, so it is loaded once. */
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

/**
 * A change to the data. Once it has worked, everything on screen that may show it is read again:
 * an order is on the home screen, in two lists, on the client's page and in the racket's history.
 *
 * What is only added (a string, a racket, a client, a service) is on no order and in no total yet: it changes the lists
 * it is in, and `affects` names them. Reading all of the rest again, each with its screen drawn again behind the form
 * that was just saved, made saving a string a pause.
 */
function useAction<Vars, Result>(
  run: (request: Request, vars: Vars) => Promise<Result>,
  affects?: readonly string[]
) {
  const request = useRequest();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (vars: Vars) => run(request, vars),
    onSuccess: () => {
      // Not returned: the caller carries on at once, and the screens update as the answers arrive. The reference
      // list is nobody's data: nothing done here changes it.
      void queryClient.invalidateQueries({
        predicate: ({ queryKey: [root] }) => (affects ? affects.includes(String(root)) : root !== 'reference'),
      });
    },
  });
}

export const useCreateOrder = () =>
  useAction((request, input: OrderInput) =>
    request<OrderDetail>('/api/orders', { method: 'POST', body: input })
  );

export const useUpdateOrder = () =>
  useAction((request, { id, ...input }: OrderInput & { id: string }) =>
    request<OrderDetail>(`/api/orders/${id}`, { method: 'PATCH', body: input })
  );

export const useDeleteOrder = () =>
  useAction((request, id: string) => request<{ ok: true }>(`/api/orders/${id}`, { method: 'DELETE' }));

export type ClientInput = { name?: string; phone?: string | null; email?: string | null; notes?: string | null };

export const useCreateClient = () =>
  useAction(
    (request, input: ClientInput) => request<Client>('/api/clients', { method: 'POST', body: input }),
    ['clients']
  );

export const useUpdateClient = () =>
  useAction((request, { id, ...input }: ClientInput & { id: string }) =>
    request<Client>(`/api/clients/${id}`, { method: 'PATCH', body: input })
  );

export const useDeleteClient = () =>
  useAction((request, id: string) => request<{ ok: true }>(`/api/clients/${id}`, { method: 'DELETE' }));

export type RacketInput = {
  // Left out, the racket is a catalog racket: one the stringer keeps in stock.
  client_id?: string;
  brand?: string;
  model?: string;
  notes?: string | null;
  track_stock?: boolean;
  stock?: number;
};

// A client's racket is in the client's page and in how many rackets the client has.
export const useCreateRacket = () =>
  useAction(
    (request, input: RacketInput) => request<Racket>('/api/rackets', { method: 'POST', body: input }),
    ['rackets', 'clients', 'client']
  );

export const useUpdateRacket = () =>
  useAction((request, { id, ...input }: RacketInput & { id: string }) =>
    request<Racket>(`/api/rackets/${id}`, { method: 'PATCH', body: input })
  );

export const useDeleteRacket = () =>
  useAction((request, id: string) => request<{ ok: true }>(`/api/rackets/${id}`, { method: 'DELETE' }));

export type StringInput = {
  brand?: string;
  model?: string;
  gauge?: string | null;
  type?: StringType;
  default_price?: number | null;
  track_stock?: boolean;
  stock?: number;
};

export const useCreateString = () =>
  useAction(
    (request, input: StringInput) => request<CatalogString>('/api/strings', { method: 'POST', body: input }),
    ['strings']
  );

export const useUpdateString = () =>
  useAction((request, { id, ...input }: StringInput & { id: string }) =>
    request<CatalogString>(`/api/strings/${id}`, { method: 'PATCH', body: input })
  );

export const useDeleteString = () =>
  useAction((request, id: string) => request<{ ok: true }>(`/api/strings/${id}`, { method: 'DELETE' }));

export type ServiceInput = { name?: string; price?: number | null; kind?: 'labor' | 'extra'; active?: boolean };

export const useCreateService = () =>
  useAction(
    (request, input: ServiceInput) => request<Service>('/api/services', { method: 'POST', body: input }),
    ['services']
  );

export const useUpdateService = () =>
  useAction((request, { id, ...input }: ServiceInput & { id: string }) =>
    request<Service>(`/api/services/${id}`, { method: 'PATCH', body: input })
  );

export const useDeletePhoto = () =>
  useAction((request, id: string) => request<{ ok: true }>(`/api/photos/${id}`, { method: 'DELETE' }));
