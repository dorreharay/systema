import { Pressable, Switch, View, type SwitchProps } from 'react-native';

import { colors } from '@/components/ui/colors';
import { useIsWide } from '@/lib/layout';

type AppSwitchProps = Omit<SwitchProps, 'trackColor' | 'thumbColor' | 'ios_backgroundColor'> & {
  // Smaller, for a switch that stands in a row of a list: it is drawn at 88% from its right edge.
  compact?: boolean;
};

const COMPACT = { transform: [{ scale: 0.88 }], transformOrigin: 'right center' } as const;

/**
 * The web's switch. From the tablet's width up it is an iOS one (below, `IosSwitch`: react-native-web's own is a Material one, a thumb
 * larger than a thin track, which is not what the app looks like). Narrower than that the web build is the phone's and has the switch
 * it has always had, the one of react-native-web, as app-switch.tsx has it (that file is the phone's, with the system's own switch).
 */
export default function AppSwitch({ compact, style, ...props }: AppSwitchProps) {
  const wide = useIsWide();

  if (wide) return <IosSwitch compact={compact} style={style} {...props} />;
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

// A track of 51 by 31 and a white thumb of 27 with a soft shadow, 2 in from the edge, that slides across as the track changes its colour:
// the sizes of the system's switch on iOS.
const TRACK_WIDTH = 51;
const TRACK_HEIGHT = 31;
const THUMB = 27;
const INSET = 2;
const SLIDE = TRACK_WIDTH - THUMB - INSET * 2;

type KeyEvent = { key?: string; preventDefault?: () => void };

function IosSwitch({ value = false, onValueChange, disabled = false, compact, style, accessibilityLabel, testID }: AppSwitchProps) {
  const toggle = () => onValueChange?.(!value);
  // A press has Enter; a switch is also switched with Space, as a checkbox is. (`onKeyDown` is the web's, not in React Native's own types.)
  const web = {
    onKeyDown: (event: KeyEvent) => {
      if (event.key !== ' ') return;
      event.preventDefault?.();
      if (!disabled) toggle();
    },
  };

  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={accessibilityLabel}
      // (react-native-web has no `accessibilityState`: the state a screen reader hears is `aria-checked`.)
      aria-checked={value}
      disabled={disabled}
      onPress={toggle}
      testID={testID}
      style={[
        {
          width: TRACK_WIDTH,
          height: TRACK_HEIGHT,
          borderRadius: TRACK_HEIGHT / 2,
          backgroundColor: value ? colors.primary : colors.switchOff,
          opacity: disabled ? 0.5 : 1,
        },
        compact && COMPACT,
        style,
      ]}
      className="transition-colors duration-200"
      {...(web as object)}>
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          top: INSET,
          left: INSET,
          width: THUMB,
          height: THUMB,
          borderRadius: THUMB / 2,
          backgroundColor: colors.white,
          transform: [{ translateX: value ? SLIDE : 0 }],
        }}
        className="shadow-[0_3px_8px_rgba(0,0,0,0.15),0_1px_1px_rgba(0,0,0,0.16)] transition-transform duration-200"
      />
    </Pressable>
  );
}
