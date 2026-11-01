import { createContext, use, useCallback, useRef, useState, type ReactNode } from 'react';
import { Modal, Pressable, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

import AppButton from '@/components/ui/app-button';
import { Text } from '@/components/ui/text';
import { useI18n } from '@/lib/i18n';

export type ConfirmOptions = {
  title: string;
  message?: string;
  confirmLabel: string;
  cancelLabel?: string;
  // Deleting something, or throwing away what was typed: the button is red.
  destructive?: boolean;
};

type Confirm = (options: ConfirmOptions) => Promise<boolean>;
const ConfirmContext = createContext<Confirm | null>(null);

/** `const confirm = useConfirm(); if (await confirm({...})) ...` */
export function useConfirm() {
  const value = use(ConfirmContext);
  if (!value) {
    throw new Error('useConfirm must be used inside <ConfirmProvider>');
  }
  return value;
}

// One dialog for the whole app. Alert.alert cannot be used: it does nothing on the web.
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<((answer: boolean) => void) | undefined>(undefined);

  const confirm = useCallback<Confirm>((next) => {
    // A second question while one is open answers the first with "no".
    resolver.current?.(false);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
      setOptions(next);
    });
  }, []);

  const answer = (value: boolean) => {
    resolver.current?.(value);
    resolver.current = undefined;
    setOptions(null);
  };

  return (
    <ConfirmContext value={confirm}>
      {children}
      <Modal transparent visible={!!options} animationType="none" onRequestClose={() => answer(false)}>
        {options ? (
          <Animated.View
            entering={FadeIn.duration(150)}
            exiting={FadeOut.duration(120)}
            className="flex-1 items-center justify-center bg-black/40 px-6">
            <Pressable
              accessibilityLabel={t('close')}
              className="absolute inset-0"
              onPress={() => answer(false)}
            />
            <View
              accessibilityViewIsModal
              className="w-full max-w-sm gap-4 rounded-3xl bg-white p-5">
              <View className="gap-1.5">
                <Text accessibilityRole="header" className="text-[19px] font-semibold">
                  {options.title}
                </Text>
                {options.message ? (
                  <Text className="text-[15px] text-muted">{options.message}</Text>
                ) : null}
              </View>
              <View className="gap-2">
                <AppButton
                  title={options.confirmLabel}
                  variant={options.destructive ? 'danger' : 'primary'}
                  onPress={() => answer(true)}
                />
                <AppButton
                  title={options.cancelLabel ?? t('cancel')}
                  variant="ghost"
                  onPress={() => answer(false)}
                />
              </View>
            </View>
          </Animated.View>
        ) : null}
      </Modal>
    </ConfirmContext>
  );
}
