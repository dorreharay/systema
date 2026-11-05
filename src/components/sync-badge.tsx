import { Badge } from '@/components/ui/badge';
import { useI18n } from '@/lib/i18n';
import type { Mark } from '@/lib/offline/types';

/** On an order that the server has not got in full: it was not sent yet, it waits for a change that was refused, or it was refused. */
export default function SyncBadge({ mark }: { mark: Mark }) {
  const { t } = useI18n();
  return (
    <Badge
      label={t(`mark_${mark}`)}
      tone={mark === 'failed' ? 'danger' : mark === 'blocked' ? 'warning' : 'neutral'}
    />
  );
}
