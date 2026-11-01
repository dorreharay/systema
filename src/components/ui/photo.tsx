import { X } from 'lucide-react-native';
import { Image, Modal, Pressable, View } from 'react-native';

import { colors } from '@/components/ui/colors';
import { Skeleton } from '@/components/ui/skeleton';
import { useI18n } from '@/lib/i18n';
import { usePhotoUri } from '@/lib/queries';

type ThumbProps = {
  onPress?: () => void;
  onRemove?: () => void;
  className?: string;
};

const FRAME = 'relative aspect-square overflow-hidden rounded-xl bg-neutral-100';

function RemoveButton({ onRemove }: { onRemove: () => void }) {
  const { t } = useI18n();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('photo_remove')}
      hitSlop={8}
      onPress={onRemove}
      className="absolute right-1.5 top-1.5 size-7 items-center justify-center rounded-full bg-black/60">
      <X size={16} color={colors.white} />
    </Pressable>
  );
}

/** A photo that is on the server. It needs the token, so it is fetched, not given to <Image> as a link. */
export function ServerPhoto({ id, onPress, onRemove, className = '' }: ThumbProps & { id: string }) {
  const { t } = useI18n();
  const { data: uri, isError } = usePhotoUri(id);
  return (
    <View className={`${FRAME} ${className}`}>
      {uri ? (
        <Pressable accessibilityRole="imagebutton" accessibilityLabel={t('photo_open')} onPress={onPress} className="flex-1">
          <Image source={{ uri }} resizeMode="cover" className="size-full" />
        </Pressable>
      ) : isError ? null : (
        <Skeleton className="size-full rounded-none" />
      )}
      {onRemove ? <RemoveButton onRemove={onRemove} /> : null}
    </View>
  );
}

/** A photo just taken or chosen, not yet sent. */
export function LocalPhotoThumb({ uri, onRemove, className = '' }: ThumbProps & { uri: string }) {
  return (
    <View className={`${FRAME} ${className}`}>
      <Image source={{ uri }} resizeMode="cover" className="size-full" />
      {onRemove ? <RemoveButton onRemove={onRemove} /> : null}
    </View>
  );
}

/** A photo shown large, over everything, until it is closed. */
export function PhotoViewer({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { t } = useI18n();
  return (
    <Modal visible={!!id} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        accessibilityLabel={t('close')}
        onPress={onClose}
        className="flex-1 items-center justify-center bg-black/90">
        {id ? <ViewerImage id={id} /> : null}
        <View className="absolute right-4 top-14 size-11 items-center justify-center rounded-full bg-white/20">
          <X size={24} color={colors.white} />
        </View>
      </Pressable>
    </Modal>
  );
}

function ViewerImage({ id }: { id: string }) {
  const { data: uri } = usePhotoUri(id);
  return uri ? <Image source={{ uri }} resizeMode="contain" className="size-full" /> : null;
}
