import { Platform } from 'react-native';

/**
 * Where the text of a field sits, so that it looks to be in the middle of the field.
 *
 * Euclid's line is taller above the letters than below them: its ascender is 1.0 em and the tallest letter 0.75 em, its
 * descender 0.27 em and the deepest letter 0.21 em. Capitals and digits are in the middle of such a line, but small
 * letters sit 0.1 em (1.7 pt at this size) low in it, so a text of small letters looks low in its field. On iOS the text
 * of a field is lifted by 1 pt, which leaves whatever is in a field within a point of the middle.
 *
 * A TextInput must not have a line height of its own (`text-base` has one, 1.5 times the size): iOS puts all of the extra
 * height of the line above the text of a single line, and the text drops by 3.8 pt. It is sized by its padding instead:
 * the two add up to what makes the field 46 pt tall, and half of their difference is the lift. A `Text` keeps its extra
 * height on both sides, so a lift of 2 pt of padding below it (half of that) is enough.
 *
 * Android is as it was: no lift, and the line height of `text-base`.
 */

/** The size and the padding of the TextInput of a single line. */
export const FIELD_INPUT_TEXT = Platform.select({
  ios: 'text-[15.4px] pt-[11.33px] pb-[13.33px]',
  default: 'text-base py-3',
});

/**
 * The text of a field for searching: the same, and on a wide screen (`md:`, where a field is not a thing to touch) the size of the text
 * of the page, 15 px, and the field a little lower, so that a search does not shout over what it searches. (The field it stands in
 * is `md:min-h-11`.)
 */
export const SEARCH_INPUT_TEXT = `${FIELD_INPUT_TEXT} md:text-[15px] md:py-2.5`;

/** For a `Text` that stands in a field (the value of a select, a prefix, a suffix): it is lifted by 1 pt. */
export const FIELD_TEXT_LIFT = 'ios:pb-[2px]';
