import { Image } from 'expo-image';
import { View } from 'react-native';
import { styled } from 'react-native-css';

const BackgroundImage = styled(Image);

// How much of the picture shows through: the page is white, with only a hint of the soft colour of the picture in it.
const PAGE_BACKGROUND_OPACITY = 0.14;

// The picture is drawn this much taller than the page and held by its top edge, so that the credit line in its bottom corner
// ("小红书") falls outside the page and is cut off.
const PICTURE_HEIGHT = '112%';

/**
 * The light background of the pages of the signed-in app: a grainy gradient (assets/images/bg2.jpg) laid over the white of the
 * page at a very low opacity, as a hint. It is drawn first inside a page (see Screen), takes no touch, and is not read out by a screen reader.
 */
export default function PageBackground() {
  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      className="absolute inset-0 overflow-hidden"
      style={{ opacity: PAGE_BACKGROUND_OPACITY }}>
      <BackgroundImage
        source={require('@/assets/images/bg2.jpg')}
        contentFit="cover"
        className="absolute inset-x-0 top-0"
        style={{ height: PICTURE_HEIGHT }}
      />
    </View>
  );
}
