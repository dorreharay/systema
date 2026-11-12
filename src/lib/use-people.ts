import { useMemo } from 'react';

import { useSnapshot } from '@/lib/offline/react';
import { useTeam } from '@/lib/team-api';
import type { Person } from '@/lib/types';
import { useSelf, useWorkshop } from '@/lib/use-workshop';
import type { WorkshopRole } from '@/lib/workshop';

/** A person an order can be given to, with the role they have in the workshop (when it is known). */
export type Worker = Person & { role: WorkshopRole | null };

/**
 * The people an order can be given to: the owner and the masters of the workshop (a receptionist takes orders in and does not string them).
 *
 * They are read from the server's team while `open` (the list is needed only when it is looked at). With no connection, or before the
 * server has answered, it is the people this phone knows: the person at the phone (the owner who is giving) and everyone who has a
 * performer on an order in the copy. A person who has never had an order is missing from that, and appears once the team is read.
 */
export function useWorkers(open: boolean): { workers: Worker[]; known: boolean } {
  const { canAssign } = useWorkshop();
  const self = useSelf();
  const { tables } = useSnapshot();
  const team = useTeam(open && canAssign);

  return useMemo(() => {
    if (team.data) {
      const people = team.data.members
        .filter((member) => member.role === 'owner' || member.role === 'master')
        .map((member) => ({ id: member.user_id, name: member.name, role: member.role }));
      return { workers: people, known: true };
    }
    if (!open) return { workers: [], known: false };
    const found = new Map<string, Worker>();
    if (self) found.set(self.id, { ...self, role: 'owner' });
    for (const order of Object.values(tables.orders)) {
      if (order.assignee && !found.has(order.assignee.id)) found.set(order.assignee.id, { ...order.assignee, role: null });
    }
    return { workers: [...found.values()], known: false };
  }, [team.data, open, self, tables.orders]);
}
