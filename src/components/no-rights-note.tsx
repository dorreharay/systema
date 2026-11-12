import { View } from 'react-native';

import { Lock } from '@/components/icons';
import { colors } from '@/components/ui/colors';
import { Text } from '@/components/ui/text';
import { useI18n } from '@/lib/i18n';
import { useWorkshop } from '@/lib/use-workshop';

/**
 * In place of a form the person may not use: the catalog, the stock and the prices are the owner's, and nothing can be changed while the
 * workshop is paused. (The buttons that open the forms are off already; this is for a form that is opened from somewhere that was not
 * thought of, and the server refuses the change anyway.)
 */
export default function NoRightsNote() {
  const { t } = useI18n();
  const { paused } = useWorkshop();

  return (
    <View className="flex-row items-start gap-3 rounded-2xl bg-surface px-4 py-3.5">
      <Lock size={20} color={colors.primary} />
      <Text className="min-w-0 flex-1 text-[15.5px] leading-[21px]">{t(paused ? 'paused_form_note' : 'stock_owner_only')}</Text>
    </View>
  );
}
