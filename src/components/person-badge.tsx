import { View } from 'react-native';

import { colors } from '@/components/ui/colors';
import { Text } from '@/components/ui/text';
import type { Person } from '@/lib/types';
import { initialsOf } from '@/lib/workshop';

// The soft colours of the app, one of which a person keeps for good (by their id), so that the same person is the same colour on every
// screen: the cards of the queue, the order's page, the team, the report.
const TINTS = [colors.newOrder, colors.clients, colors.catalog, colors.primarySoft];

function tintOf(id: string) {
  let sum = 0;
  for (const char of id) sum = (sum + char.charCodeAt(0)) % 997;
  return TINTS[sum % TINTS.length];
}

/** The initials of a person in a soft circle. Nobody (null) is an empty grey circle: the order waits in the queue. */
export function PersonBadge({ person, size = 28 }: { person: Pick<Person, 'id' | 'name'> | null | undefined; size?: number }) {
  return (
    <View
      className="items-center justify-center rounded-full"
      style={{ width: size, height: size, backgroundColor: person ? tintOf(person.id) : colors.surface }}>
      <Text className="font-bold text-ink" style={{ fontSize: Math.max(10, Math.round(size * 0.4)) }} maxFontSizeMultiplier={1.2}>
        {person ? initialsOf(person.name) : ''}
      </Text>
    </View>
  );
}
export default PersonBadge;
