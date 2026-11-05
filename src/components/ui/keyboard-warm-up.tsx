import { useEffect, useRef, useState } from 'react';
import { Keyboard, Platform, TextInput, View } from 'react-native';

import { Input, NumberInput, type InputRef } from '@/components/ui/input';
import { isSheetOnScreen } from '@/components/ui/sheet';

// How long to wait after the app is up (its first page is drawn and the logo has typed itself out), and how often to look
// again if it is not quiet by then.
const WAIT_MS = 2500;
const RETRY_MS = 1000;
const TRIES = 5;
// How long the fields stay, for the system to be done with them.
const STAY_MS = 2000;

/**
 * The first time a text field gets the cursor in the app, the system takes a good part of a second to set up the keyboard
 * and the way text is typed, and the app stands still for it. If that is when a sheet has just come up, the sheet stands
 * still too, and the keyboard comes late. So it is done at a time nobody is looking: a little after the app is up, a field
 * with the same settings as the ones of the forms (a name, a phone number, an email, a number, a note) gets the cursor
 * and loses it at once. It is out of sight and out of reach, the keyboard is called off before it is drawn, and it is done
 * once. It does nothing if somebody is typing or a sheet is up by then.
 */
export default function KeyboardWarmUp() {
  const [on, setOn] = useState(false);
  const field = useRef<InputRef>(null);

  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    let tries = 0;
    let timer: ReturnType<typeof setTimeout>;
    const attempt = () => {
      if (Keyboard.isVisible() || isSheetOnScreen() || TextInput.State.currentlyFocusedInput()) {
        tries += 1;
        if (tries < TRIES) timer = setTimeout(attempt, RETRY_MS);
        return;
      }
      setOn(true);
    };
    timer = setTimeout(attempt, WAIT_MS);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!on) return;
    field.current?.focus();
    field.current?.blur();
    const timer = setTimeout(() => setOn(false), STAY_MS);
    return () => clearTimeout(timer);
  }, [on]);

  if (!on) return null;

  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ position: 'absolute', top: -500, left: 0, right: 0, opacity: 0 }}>
      <Input ref={field} autoCapitalize="words" autoComplete="name" />
      <Input keyboardType="phone-pad" autoComplete="tel" />
      <Input keyboardType="email-address" autoCapitalize="none" autoComplete="email" />
      <NumberInput value="" onChangeText={() => {}} />
      <Input multiline />
    </View>
  );
}
