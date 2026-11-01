import { View } from 'react-native';

import { Text } from '@/components/ui/text';

// The first letter of a name in a soft circle.
export default function Avatar({ name, size = 44 }: { name: string; size?: number }) {
  return (
    <View
      className="items-center justify-center rounded-full bg-primary-soft"
      style={{ width: size, height: size }}>
      <Text className="text-lg font-semibold text-primary">{name.trim().charAt(0).toUpperCase() || '?'}</Text>
    </View>
  );
}
