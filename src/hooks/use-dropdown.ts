import { useEffect, useId, useRef } from 'react';
import { Platform, View } from 'react-native';

type Closer = () => void;

// Only one dropdown can be open across the whole app at a time: opening a new
// one asks the previously active one to close itself.
class DropdownManager {
  private activeId: string | null = null;
  private activeClose: Closer | null = null;

  openExclusive(id: string, close: Closer) {
    if (this.activeId !== null && this.activeId !== id) {
      this.activeClose?.();
    }
    this.activeId = id;
    this.activeClose = close;
  }

  close(id: string) {
    if (this.activeId === id) {
      this.activeId = null;
      this.activeClose = null;
    }
  }
}

const dropdownManager = new DropdownManager();

// Shared behavior for every dropdown/popover in the app: opening one closes
// whichever other dropdown was open, and clicking outside closes it too.
// Works with both self-managed (useState) and externally-controlled dropdowns,
// since it only needs the current open flag and a way to request a close.
export function useDropdown(open: boolean, onOpenChange: (open: boolean) => void) {
  const id = useId();
  const ref = useRef<View>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    dropdownManager.openExclusive(id, () => onOpenChange(false));
    return () => dropdownManager.close(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, id]);

  useEffect(() => {
    if (!open || Platform.OS !== 'web') {
      return;
    }
    const handlePointerDown = (event: Event) => {
      const node = ref.current as unknown as HTMLElement | null;
      const target = (event as PointerEvent).target;
      if (node && typeof node.contains === 'function' && target instanceof Node && !node.contains(target)) {
        onOpenChange(false);
      }
    };
    document.addEventListener('pointerdown', handlePointerDown, true);
    return () => document.removeEventListener('pointerdown', handlePointerDown, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return ref;
}
