import type { ReactNode } from 'react';
import { View } from 'react-native';

import Sidebar from '@/components/sidebar';
import { useLayoutMode } from '@/lib/layout';

/**
 * What the pages of the signed-in app stand in. On the phone it is nothing: the pages are the whole screen, as they always were.
 * On a wide screen (tablet and desktop, the web) it is the sidebar at the left, and the pages in a light pane to the right of it,
 * with rounded corners and a margin of the dark ground round it, the way the phone's pages stand on the dark band of the navigation.
 *
 * It has the same views on every size, only styled differently, so that the stack of pages inside is never mounted again when the
 * window crosses a width (a phone turned on its side): what was typed in a form stays.
 */
export default function AppShell({ sidebar, children }: { sidebar: boolean; children: ReactNode }) {
  const mode = useLayoutMode();
  // The sidebar is for an account that has finished the setup: until then there is nowhere to go.
  const framed = mode !== 'phone' && sidebar;

  return (
    <View className={mode === 'phone' ? 'flex-1' : 'flex-1 flex-row bg-chrome'}>
      {framed ? <Sidebar mode={mode === 'desktop' ? 'desktop' : 'tablet'} /> : null}
      <View className={framed ? 'min-w-0 flex-1 py-2 pr-2' : 'flex-1'}>
        <View className={framed ? 'flex-1 overflow-hidden rounded-[18px] bg-surface' : 'flex-1'}>{children}</View>
      </View>
    </View>
  );
}
