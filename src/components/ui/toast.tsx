import { CircleAlert, CircleCheck } from 'lucide-react-native';
import { createContext, use, useCallback, useRef, useState, type ReactNode } from 'react';
import { View } from 'react-native';
import Animated, { FadeInUp, FadeOutUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '@/components/ui/text';

type ToastTone = 'success' | 'error';
type ToastState = { id: number; message: string; tone: ToastTone };
type ToastApi = { success: (message: string) => void; error: (message: string) => void };

const DURATION_MS = 3000;
const ToastContext = createContext<ToastApi | null>(null);

export function useToast() {
  const value = use(ToastContext);
  if (!value) {
    throw new Error('useToast must be used inside <ToastProvider>');
  }
  return value;
}

// A short message at the top of the screen that goes away by itself: the answer to "did that work?".
export function ToastProvider({ children }: { children: ReactNode }) {
  const insets = useSafeAreaInsets();
  const [toast, setToast] = useState<ToastState | null>(null);
  const counter = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const show = useCallback((message: string, tone: ToastTone) => {
    counter.current += 1;
    setToast({ id: counter.current, message, tone });
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(null), DURATION_MS);
  }, []);

  const api: ToastApi = {
    success: (message) => show(message, 'success'),
    error: (message) => show(message, 'error'),
  };

  return (
    <ToastContext value={api}>
      {children}
      <View
        pointerEvents="none"
        className="absolute inset-x-0 top-0 z-50 items-center px-4"
        style={{ paddingTop: insets.top + 8 }}>
        {toast ? (
          <Animated.View
            key={toast.id}
            entering={FadeInUp.duration(220)}
            exiting={FadeOutUp.duration(180)}
            accessibilityLiveRegion="polite"
            accessibilityRole="alert"
            className="max-w-md flex-row items-center gap-2.5 rounded-2xl bg-ink px-4 py-3">
            {toast.tone === 'success' ? (
              <CircleCheck size={20} color="#4ade80" />
            ) : (
              <CircleAlert size={20} color="#fca5a5" />
            )}
            <Text className="shrink text-[15px] font-medium text-white">{toast.message}</Text>
          </Animated.View>
        ) : null}
      </View>
    </ToastContext>
  );
}

