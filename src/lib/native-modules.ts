import { requireOptionalNativeModule } from 'expo';
import { Platform } from 'react-native';

/**
 * Whether this build of the app contains an Expo native module. A development build made before a
 * package was added does not: loading that package then throws (and the development tools show it as an
 * error), so the app asks first and does without, until the build is made again.
 */
// On the web there is no native side to be missing: each package brings its own web version.
export const hasNativeModule = (name: string) => Platform.OS === 'web' || !!requireOptionalNativeModule(name);

// The native names of the modules that are loaded on demand.
export const NATIVE_NOTIFICATIONS = 'ExpoPushTokenManager';
export const NATIVE_IMAGE_PICKER = 'ExponentImagePicker';
export const NATIVE_CLIPBOARD = 'ExpoClipboard';
