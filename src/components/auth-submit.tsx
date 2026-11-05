import type { ReactNode } from 'react';
import { use, useEffect, useRef } from 'react';
import { View } from 'react-native';

import type { AuthViewRef } from '@/components/auth-leave';
import { AuthSubmitContext } from '@/components/auth-leave';

// The button that sends the form of a sign-in screen. The keyboard goes just under it (see AuthLayout), and the other ways in
// below it, the buttons of Apple and Google, are behind the keyboard.
export default function AuthSubmit({ children }: { children: ReactNode }) {
  const registry = use(AuthSubmitContext);
  const ref = useRef<AuthViewRef>(null);

  useEffect(() => {
    const node = ref.current;
    if (!registry || !node) {
      return;
    }
    registry.measure(node);
    return () => registry.forget();
  }, [registry]);

  return (
    <View
      ref={ref}
      onLayout={() => {
        if (registry && ref.current) {
          registry.measure(ref.current);
        }
      }}>
      {children}
    </View>
  );
}
