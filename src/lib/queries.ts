import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { useCallback } from 'react';

import { api, apiBlob, apiUpload, type RequestOptions } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import type {
  CatalogString,
  Client,
  ClientDetail,
  Dashboard,
  Order,
  OrderDetail,
  OrderInput,
  OrderPhoto,
  OrderStatus,
  Racket,
  RacketDetail,
  Service,
  StringType,
} from '@/lib/types';

const ORDERS_PAGE = 30;

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

export const useRackets = ({ q = '', clientId }: { q?: string; clientId?: string } = {}) => {
  const request = useRequest();
  return useQuery({
    queryKey: ['rackets', { q: q.trim(), clientId }],
    queryFn: () => {
      const params = new URLSearchParams();
      if (q.trim()) params.set('q', q.trim());
      if (clientId) params.set('client_id', clientId);
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

export const useStrings = (q = '') => {
  const request = useRequest();
  return useQuery({
    queryKey: ['strings', q.trim()],
    queryFn: () => request<{ items: CatalogString[] }>(`/api/strings${search(q)}`),
    placeholderData: keepPreviousData,
    select: (data) => data.items,
  });
};

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
 */
function useAction<Vars, Result>(run: (request: Request, vars: Vars) => Promise<Result>) {
  const request = useRequest();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (vars: Vars) => run(request, vars),
    onSuccess: () => {
      // Not returned: the caller carries on at once, and the screens update as the answers arrive.
      void queryClient.invalidateQueries();
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
  useAction((request, input: ClientInput) =>
    request<Client>('/api/clients', { method: 'POST', body: input })
  );

export const useUpdateClient = () =>
  useAction((request, { id, ...input }: ClientInput & { id: string }) =>
    request<Client>(`/api/clients/${id}`, { method: 'PATCH', body: input })
  );

export const useDeleteClient = () =>
  useAction((request, id: string) => request<{ ok: true }>(`/api/clients/${id}`, { method: 'DELETE' }));

export type RacketInput = { client_id?: string; brand?: string; model?: string; notes?: string | null };

export const useCreateRacket = () =>
  useAction((request, input: RacketInput) =>
    request<Racket>('/api/rackets', { method: 'POST', body: input })
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
};

export const useCreateString = () =>
  useAction((request, input: StringInput) =>
    request<CatalogString>('/api/strings', { method: 'POST', body: input })
  );

export const useUpdateString = () =>
  useAction((request, { id, ...input }: StringInput & { id: string }) =>
    request<CatalogString>(`/api/strings/${id}`, { method: 'PATCH', body: input })
  );

export const useDeleteString = () =>
  useAction((request, id: string) => request<{ ok: true }>(`/api/strings/${id}`, { method: 'DELETE' }));

export type ServiceInput = { name?: string; price?: number | null; kind?: 'labor' | 'extra'; active?: boolean };

export const useCreateService = () =>
  useAction((request, input: ServiceInput) =>
    request<Service>('/api/services', { method: 'POST', body: input })
  );

export const useUpdateService = () =>
  useAction((request, { id, ...input }: ServiceInput & { id: string }) =>
    request<Service>(`/api/services/${id}`, { method: 'PATCH', body: input })
  );

export const useDeletePhoto = () =>
  useAction((request, id: string) => request<{ ok: true }>(`/api/photos/${id}`, { method: 'DELETE' }));

/** A picture chosen on the phone, not yet sent. */
export type LocalPhoto = { uri: string; mimeType?: string | null };

/** Sends pictures to an order one by one; returns how many could not be sent. */
export function useUploadPhotos() {
  const { token } = useAuth();
  const queryClient = useQueryClient();
  return useCallback(
    async (orderId: string, photos: LocalPhoto[]) => {
      let failed = 0;
      for (const photo of photos) {
        try {
          const blob = await (await fetch(photo.uri)).blob();
          await apiUpload<OrderPhoto>(
            `/api/orders/${orderId}/photos`,
            blob,
            photo.mimeType || blob.type || 'image/jpeg',
            token
          );
        } catch {
          failed += 1;
        }
      }
      void queryClient.invalidateQueries({ queryKey: ['order', orderId] });
      return failed;
    },
    [queryClient, token]
  );
}
