import { useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, View } from 'react-native';

import { BUTTON_RADIUS } from '@/components/ui/button-radius';
import { PAPER_RAISED, SURFACE_EDGE } from '@/components/ui/paper';
import { Text } from '@/components/ui/text';
import { useI18n } from '@/lib/i18n';
import { useQueueSummary } from '@/lib/queries';
import { useSelf, useWorkshop } from '@/lib/use-workshop';
import type { Queue } from '@/lib/workshop';

const VALUES: Queue[] = ['all', 'mine', 'none'];

/**
 * Which orders the list shows, in a workshop with a team: all of them, the person's own, or the queue (nobody has taken them). A master
 * starts on their own, everyone else on all. It does nothing in a workshop of one: `queue` is `all`, the list is not filtered and
 * nothing is read for the counter. The home screen can open the list on the queue (`/orders?queue=none`).
 */
export function useQueueFilter() {
  const { team, role } = useWorkshop();
  const self = useSelf();
  const asked = useLocalSearchParams<{ queue?: string }>().queue;
  const first = VALUES.find((candidate) => candidate === asked);
  // What is chosen, and the word of the link it was last set from: a new word (the home screen leads here again) sets the choice anew.
  const [state, setState] = useState<{ asked: string | undefined; value: Queue }>({
    asked,
    value: first ?? (role === 'master' ? 'mine' : 'all'),
  });
  let chosen = state.value;
  if (state.asked !== asked) {
    chosen = first ?? state.value;
    setState({ asked, value: chosen });
  }
  const setChosen = useCallback((value: Queue) => setState((current) => ({ ...current, value })), []);
  const summary = useQueueSummary(self?.id, team);

  return {
    team,
    queue: team ? chosen : ('all' as Queue),
    setQueue: setChosen,
    me: self?.id,
    /** How many orders are in the queue (still to be done, with no performer). */
    waiting: summary.data?.queue ?? 0,
  };
}

type QueueChipsProps = {
  value: Queue;
  onChange: (value: Queue) => void;
  waiting: number;
  /** In the row of filters of the table of a wide page: the same chips as the ones beside them. */
  wide?: boolean;
};

/** "All / Mine / No performer", the last with the number of orders in the queue. */
export default function QueueChips({ value, onChange, waiting, wide }: QueueChipsProps) {
  const { t } = useI18n();
  const labels: Record<Queue, string> = { all: t('queue_all'), mine: t('queue_mine'), none: t('queue_none') };

  return (
    <View accessibilityRole="tablist" accessibilityLabel={t('queue_filter_label')} className="flex-row flex-wrap items-center gap-2">
      {VALUES.map((key) => {
        const on = value === key;
        const count = key === 'none' ? waiting : null;
        return (
          <Pressable
            key={key}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            accessibilityLabel={count === null ? labels[key] : `${labels[key]}: ${count}`}
            onPress={() => onChange(key)}
            className={`flex-row items-center gap-2 ${
              wide ? `h-9 px-3.5 ${BUTTON_RADIUS.px15}` : `h-10 px-4 ${BUTTON_RADIUS.full44}`
            } ${on ? 'bg-primary' : wide ? `bg-white hover:bg-neutral-50 ${PAPER_RAISED}` : `bg-white ${SURFACE_EDGE}`}`}>
            <Text className={`${wide ? 'text-[14px]' : 'text-[15px]'} font-medium ${on ? 'text-white' : 'text-secondary'}`}>
              {labels[key]}
            </Text>
            {count === null ? null : (
              <Text
                className={`${wide ? 'text-[12.5px]' : 'text-[13.5px]'} font-semibold ${
                  on ? 'text-white/70' : count > 0 ? 'text-primary' : 'text-muted'
                }`}>
                {count}
              </Text>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}
