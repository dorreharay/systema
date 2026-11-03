import { Pressable, View } from 'react-native';

import type { IconComponent } from '@/components/icons';
import { colors } from '@/components/ui/colors';
import Sheet, { afterSheetsClosed } from '@/components/ui/sheet';
import { Text } from '@/components/ui/text';

export type Action = {
  label: string;
  icon?: IconComponent;
  onPress: () => void;
  // Deleting: red, and kept apart from the other actions.
  destructive?: boolean;
};

type ActionSheetProps = {
  visible: boolean;
  onClose: () => void;
  title?: string;
  actions: Action[];
};

// The overflow menu (⋯): a list of things to do, with the dangerous ones last and apart.
export default function ActionSheet({ visible, onClose, title, actions }: ActionSheetProps) {
  const safe = actions.filter((action) => !action.destructive);
  const destructive = actions.filter((action) => action.destructive);

  const row = (action: Action) => {
    const Icon = action.icon;
    const color = action.destructive ? colors.danger : colors.ink;
    return (
      <Pressable
        key={action.label}
        accessibilityRole="button"
        onPress={() => {
          onClose();
          // Whatever it opens (another sheet, a question) must wait for this one to be gone: iOS
          // will not show two modals at once.
          afterSheetsClosed(action.onPress);
        }}
        className="min-h-14 flex-row items-center gap-3 rounded-lg px-2 active:bg-surface">
        {Icon ? <Icon size={22} color={color} /> : null}
        <Text className={`text-[16.8px] font-medium ${action.destructive ? 'text-danger' : 'text-ink'}`}>
          {action.label}
        </Text>
      </Pressable>
    );
  };

  return (
    <Sheet visible={visible} onClose={onClose} title={title}>
      <View>{safe.map(row)}</View>
      {destructive.length > 0 ? (
        <View className="mt-2 border-t border-line pt-2">{destructive.map(row)}</View>
      ) : null}
    </Sheet>
  );
}
