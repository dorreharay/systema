import { Switch, type SwitchProps } from 'react-native';

import { colors } from '@/components/ui/colors';

type AppSwitchProps = Omit<SwitchProps, 'trackColor' | 'thumbColor' | 'ios_backgroundColor'> & {
  // Smaller, for a switch that stands in a row of a list: it is drawn at 88% from its right edge.
  compact?: boolean;
};

const COMPACT = { transform: [{ scale: 0.88 }], transformOrigin: 'right center' } as const;

// The app's switch: the accent when on, a track that can be told from the page when off. iOS takes the
// colour of the off track from `ios_backgroundColor`, and not from `trackColor`.
export default function AppSwitch({ compact, style, ...props }: AppSwitchProps) {
  return (
    <Switch
      trackColor={{ false: colors.switchOff, true: colors.primary }}
      ios_backgroundColor={colors.switchOff}
      thumbColor={colors.white}
      style={[compact && COMPACT, style]}
      {...props}
    />
  );
}
