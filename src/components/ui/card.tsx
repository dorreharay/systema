import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';

type CardProps = {
  children: ReactNode;
  onPress?: () => void;
  className?: string;
  accessibilityLabel?: string;
};

/**
 * The shape of a white block of a page: it runs out past the margin of the page to both edges of the screen, and is
 * rounded like the containers it sits among (see Screen). What is in it keeps its own room: the padding of the block.
 */
export const BLOCK_SHAPE = '-mx-page rounded-[18px]';
export const BLOCK = `${BLOCK_SHAPE} bg-white`;

// The room inside a block: more at the sides than above and below, and at the sides only for the rows of a list, which
// have a height of their own.
export const BLOCK_ROOM = 'px-7 py-4';
export const BLOCK_ROOM_X = 'px-7';

// A white block with room inside, from edge to edge: the only "elevation" the app uses.
export default function Card({ children, onPress, className = '', accessibilityLabel }: CardProps) {
  const base = `${BLOCK} ${BLOCK_ROOM} ${className}`;
  if (!onPress) {
    return <View className={base}>{children}</View>;
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      className={`${base} active:bg-surface`}>
      {children}
    </Pressable>
  );
}
