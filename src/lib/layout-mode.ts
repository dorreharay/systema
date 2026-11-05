import type { LayoutMode } from '@/lib/layout-sizes';

// On the phone the layout is the phone's, whatever the width (see layout-mode.web.ts for the web, which is the only place a
// window can be wider than a phone: the app is portrait-only on iOS).
export function useLayoutMode(): LayoutMode {
  return 'phone';
}
