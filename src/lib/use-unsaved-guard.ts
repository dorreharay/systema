import { useNavigation, usePreventRemove } from 'expo-router';
import { useState } from 'react';

import { useConfirm } from '@/components/ui/confirm';
import { useI18n } from '@/lib/i18n';

/**
 * Asks before leaving a form that has changes that would be lost (the back button, the swipe back,
 * the browser's back). After saving, call `allowLeave()`, and leave once the component has rendered
 * again: while the guard is still on, leaving would be stopped by it.
 */
export function useUnsavedChangesGuard(dirty: boolean) {
  const { t } = useI18n();
  const navigation = useNavigation();
  const confirm = useConfirm();
  const [allowed, setAllowed] = useState(false);

  usePreventRemove(dirty && !allowed, ({ data }) => {
    void confirm({
      title: t('discard_title'),
      message: t('discard_message'),
      confirmLabel: t('discard'),
      cancelLabel: t('keep_editing'),
      destructive: true,
    }).then((leave) => {
      if (leave) navigation.dispatch(data.action);
    });
  });

  return { allowed, allowLeave: () => setAllowed(true) };
}
