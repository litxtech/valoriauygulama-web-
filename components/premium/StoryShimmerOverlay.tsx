import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

type Props = { visible?: boolean };

/** Story/video yüklenirken HDR shimmer */
export function StoryShimmerOverlay({ visible = true }: Props) {
  const slide = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) return;
    const loop = Animated.loop(
      Animated.timing(slide, { toValue: 1, duration: 1800, useNativeDriver: true })
    );
    loop.start();
    return () => loop.stop();
  }, [visible, slide]);

  if (!visible) return null;

  const translateX = slide.interpolate({ inputRange: [0, 1], outputRange: [-120, 280] });

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Animated.View style={[styles.beam, { transform: [{ translateX }] }]}>
        <LinearGradient
          colors={['transparent', 'rgba(255,255,255,0.35)', 'transparent']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  beam: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 100,
    opacity: 0.9,
  },
});
