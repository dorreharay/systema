import { NATIVE_IMAGE_PICKER, hasNativeModule } from '@/lib/native-modules';
import type { LocalPhoto } from '@/lib/queries';

export type PickResult = { photos: LocalPhoto[] } | { error: 'denied' | 'unavailable' };

const toLocal = (assets: { uri: string; mimeType?: string | null }[]): LocalPhoto[] =>
  assets.map((asset) => ({ uri: asset.uri, mimeType: asset.mimeType }));

// The picker is loaded when it is needed. A build made before the module was added does not have it,
// and that must be "photos are not available", not a crash on start.
export async function pickFromLibrary(limit: number): Promise<PickResult> {
  if (!hasNativeModule(NATIVE_IMAGE_PICKER)) return { error: 'unavailable' };
  try {
    const ImagePicker = await import('expo-image-picker');
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      selectionLimit: Math.max(1, limit),
      quality: 0.7,
    });
    return { photos: result.canceled ? [] : toLocal(result.assets) };
  } catch {
    return { error: 'unavailable' };
  }
}

export async function takePhoto(): Promise<PickResult> {
  if (!hasNativeModule(NATIVE_IMAGE_PICKER)) return { error: 'unavailable' };
  try {
    const ImagePicker = await import('expo-image-picker');
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) return { error: 'denied' };
    const result = await ImagePicker.launchCameraAsync({ quality: 0.7 });
    return { photos: result.canceled ? [] : toLocal(result.assets) };
  } catch {
    return { error: 'unavailable' };
  }
}
