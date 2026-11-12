/**
 * The team of a Studio workshop (backend/src/routes/team.js): who is in it, the invitations, joining and leaving, the report of the month.
 * These need the server (a person is invited, or removed, by the server, not by a queue on a phone), so they are plain requests with the
 * signed-in person's token, not offline actions.
 */
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useState } from 'react';

import { api } from '@/lib/api';
import { ApiError } from '@/lib/api-error';
import type { User } from '@/lib/auth-api';
import { useAuth } from '@/lib/auth';
import type { WorkshopRole } from '@/lib/workshop';

/** The roles an invitation can be for. */
export type MemberRole = 'master' | 'receptionist';

export type TeamMember = {
  // The id of the membership (to change or remove it); null for the owner.
  id: string | null;
  user_id: string;
  name: string;
  role: WorkshopRole;
  // Only the owner sees addresses.
  email?: string;
  you: boolean;
  joined_at: string;
};

export type TeamInvite = { id: string; role: MemberRole; expires_at: string };

export type Team = {
  workshop: { owner_id: string; name: string | null; paused: boolean };
  role: WorkshopRole;
  seats: { limit: number; used: number };
  can_invite: boolean;
  members: TeamMember[];
  invites: TeamInvite[];
};

/** A new invitation. The code is shown once: the server keeps only a hash of it. */
export type NewInvite = { id: string; role: MemberRole; expires_at: string; code: string; link: string };

export type InvitePreview = { workshop: { name: string | null; owner_name: string }; role: MemberRole; expires_at: string };

export type ReportLine = {
  person: { id: string; name: string | null; role: WorkshopRole | null } | null;
  orders: number;
  revenue: number;
  avg_hours: number | null;
  share: number | null;
};

export type TeamReport = {
  month: string;
  currency: string;
  rows: ReportLine[];
  // Only the owner gets the totals.
  totals: { orders: number; revenue: number } | null;
};

const KEY = ['team'] as const;

/** The team of the workshop, read from the server. `enabled`: only where Studio exists and the person is in a team or can have one. */
export function useTeam(enabled = true) {
  const { token, status } = useAuth();
  return useQuery({
    queryKey: KEY,
    queryFn: () => api<Team>('/api/team', { token }),
    enabled: enabled && status === 'signedIn',
    staleTime: 15_000,
  });
}

/** The report of a month (`YYYY-MM`; none: this one). */
export function useTeamReport(month: string | undefined, enabled = true) {
  const { token, status } = useAuth();
  return useQuery({
    queryKey: [...KEY, 'report', month ?? 'now'],
    queryFn: () => api<TeamReport>(`/api/team/report${month ? `?month=${month}` : ''}`, { token }),
    enabled: enabled && status === 'signedIn',
    staleTime: 30_000,
  });
}

/**
 * The things a person does to the team: each is a request, `busy` while it is on its way, and `error` (the server's word, or a code the
 * screen turns into words) after a refusal. The ones that change who the person is (joining, leaving) answer with the account, which is put
 * in place at once so that the whole app sees the other workshop.
 */
export function useTeamActions() {
  const { token, setUser } = useAuth();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  const run = useCallback(
    async <T,>(request: () => Promise<T>): Promise<T | undefined> => {
      setBusy(true);
      setError(null);
      try {
        const result = await request();
        void queryClient.invalidateQueries({ queryKey: KEY });
        return result;
      } catch (err) {
        setError(err instanceof ApiError ? err : new ApiError(0, err instanceof Error ? err.message : 'Unknown error'));
        return undefined;
      } finally {
        setBusy(false);
      }
    },
    [queryClient]
  );

  return {
    busy,
    error,
    clearError: () => setError(null),
    invite: (role: MemberRole) =>
      run(async () => (await api<{ invite: NewInvite }>('/api/team/invites', { method: 'POST', body: { role }, token })).invite),
    revokeInvite: (id: string) => run(() => api<{ ok: true }>(`/api/team/invites/${id}`, { method: 'DELETE', token })),
    setRole: (id: string, role: MemberRole) =>
      run(() => api<{ ok: true }>(`/api/team/members/${id}`, { method: 'PATCH', body: { role }, token })),
    remove: (id: string) => run(() => api<{ ok: true }>(`/api/team/members/${id}`, { method: 'DELETE', token })),
    preview: (code: string) => run(() => api<InvitePreview>('/api/team/preview', { method: 'POST', body: { code }, token })),
    join: (code: string) =>
      run(async () => {
        const user = await api<User>('/api/team/join', { method: 'POST', body: { code }, token });
        setUser(user);
        return user;
      }),
    leave: () =>
      run(async () => {
        const user = await api<User>('/api/team/leave', { method: 'POST', token });
        setUser(user);
        return user;
      }),
  };
}
