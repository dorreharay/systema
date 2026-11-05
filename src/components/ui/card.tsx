import type { ReactNode } from 'react';
import { Platform, Pressable, View, type StyleProp, type ViewStyle } from 'react-native';

import { PAPER_CARD } from '@/components/ui/paper';

type CardProps = {
  children: ReactNode;
  onPress?: () => void;
  className?: string;
  accessibilityLabel?: string;
  // The card has buttons or switches of its own inside it. On the web a button cannot hold another one, so there such a card is not a
  // button: it is a block that opens when it is clicked anywhere but on what is in it (see PressableBlock).
  nested?: boolean;
};

/**
 * The shape of a white block of a page: it runs out past the margin of the page to both edges of the screen, and is
 * rounded like the containers it sits among (see Screen). What is in it keeps its own room: the padding of the block.
 * On a wide page (`md:`) it does not: it stands inside the sides of the column, so that cards can stand in a grid.
 */
export const BLOCK_SHAPE = '-mx-page rounded-[18px] md:mx-0';
// (On a wide page it is lifted off the page by a ring and soft shadows: see paper.ts.)
export const BLOCK = `${BLOCK_SHAPE} bg-white ${PAPER_CARD}`;

// The room inside a block: more at the sides than above and below, and at the sides only for the rows of a list, which
// have a height of their own.
export const BLOCK_ROOM = 'px-7 py-4';
export const BLOCK_ROOM_X = 'px-7';

type ClickEvent = { target: { closest?: (selector: string) => unknown } | null; currentTarget: unknown };
type KeyEvent = { key?: string; target: unknown; currentTarget: unknown; preventDefault?: () => void };

// What a click or a key lands on inside the block that is a control of its own.
const CONTROLS = 'button, input, a, select, textarea, [role="switch"], [role="button"], [role="checkbox"]';

/**
 * A block that is pressed as a whole and has controls of its own in it (the badge of the stock, the switch of a service). On the web it
 * is a `div` that acts as a link (a click or Enter on it opens the page), and a click on a control in it does that control's own thing
 * and nothing more. (A button in a button is not valid HTML, and a keyboard and a screen reader cannot tell which is meant.)
 */
export function PressableBlock({
  children,
  onPress,
  className,
  accessibilityLabel,
  style,
}: Required<Pick<CardProps, 'onPress'>> & CardProps & { style?: StyleProp<ViewStyle> }) {
  const web = {
    onClick: (event: ClickEvent) => {
      const control = event.target?.closest?.(CONTROLS);
      if (control && control !== event.currentTarget) return;
      onPress();
    },
    onKeyDown: (event: KeyEvent) => {
      // Only when the block itself has the focus: a control in it has Enter for itself.
      if (event.key === 'Enter' && event.target === event.currentTarget) {
        event.preventDefault?.();
        onPress();
      }
    },
  };

  return (
    <View
      focusable
      role="link"
      accessibilityLabel={accessibilityLabel}
      className={`cursor-pointer hover:bg-neutral-50 ${className}`}
      style={style}
      // (`onClick` and `onKeyDown` are the web's, and not in React Native's own types.)
      {...(web as object)}>
      {children}
    </View>
  );
}

// A white block with room inside, from edge to edge: the only "elevation" the app uses.
export default function Card({ children, onPress, className = '', accessibilityLabel, nested }: CardProps) {
  const base = `${BLOCK} ${BLOCK_ROOM} ${className}`;
  if (!onPress) {
    return <View className={base}>{children}</View>;
  }
  if (nested && Platform.OS === 'web') {
    return (
      <PressableBlock onPress={onPress} className={base} accessibilityLabel={accessibilityLabel}>
        {children}
      </PressableBlock>
    );
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      className={`${base} hover:bg-neutral-50 active:bg-surface`}>
      {children}
    </Pressable>
  );
}
