import { Switch, type SwitchProps } from 'react-native';

import { colors } from '@/components/ui/colors';

// The app's switch: the accent when on, a track that can be told from the page when off. iOS takes the
// colour of the off track from `ios_backgroundColor`, and not from `trackColor`.
export default function AppSwitch(props: Omit<SwitchProps, 'trackColor' | 'thumbColor' | 'ios_backgroundColor'>) {
  return (
    <Switch
      trackColor={{ false: colors.switchOff, true: colors.primary }}
      ios_backgroundColor={colors.switchOff}
      thumbColor={colors.white}
      {...props}
    />
  );
}
