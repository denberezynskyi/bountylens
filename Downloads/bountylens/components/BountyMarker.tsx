import React, { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSpring,
  withSequence,
  Easing,
} from 'react-native-reanimated';

interface BountyMarkerProps {
  iconName: keyof typeof MaterialCommunityIcons.glyphMap;
  badge: string;
  category: 'all' | 'hot' | 'cafes';
  isSelected: boolean;
  timeLeft?: string;
}

export function BountyMarker({
  iconName,
  badge,
  category,
  isSelected,
  timeLeft,
}: BountyMarkerProps) {
  // Анімація пульсації для гарячих точок
  const pulseScale = useSharedValue(1);
  const pulseOpacity = useSharedValue(0.6);

  // Анімація підстрибування при тапі
  const bounceScale = useSharedValue(1);

  useEffect(() => {
    if (category === 'hot') {
      pulseScale.value = withRepeat(
        withTiming(1.6, { duration: 1500, easing: Easing.out(Easing.ease) }),
        -1,
        false
      );
      pulseOpacity.value = withRepeat(
        withTiming(0, { duration: 1500, easing: Easing.out(Easing.ease) }),
        -1,
        false
      );
    }
  }, [category]);

  useEffect(() => {
    if (isSelected) {
      bounceScale.value = withSequence(
        withSpring(1.2, { damping: 4, stiffness: 200 }),
        withSpring(1.08, { damping: 6, stiffness: 150 })
      );
    } else {
      bounceScale.value = withSpring(1);
    }
  }, [isSelected]);

  const animatedPulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseScale.value }],
    opacity: pulseOpacity.value,
  }));

  const animatedBubbleStyle = useAnimatedStyle(() => ({
    transform: [{ scale: bounceScale.value }],
  }));

  const isHot = category === 'hot';

  return (
    <View style={styles.container}>
      {/* Пульсуюче коло позаду (тільки для гарячих) */}
      {isHot && (
        <Animated.View style={[styles.pulseRing, animatedPulseStyle]} />
      )}

      {/* Головне тіло маркера */}
      <Animated.View
        style={[
          styles.bubbleWrapper,
          isSelected && styles.bubbleSelected,
          animatedBubbleStyle,
        ]}
      >
        {/* Верхній міні-бейдж часу (якщо є) */}
        {timeLeft && (
          <View style={[styles.timeBadge, isSelected && styles.timeBadgeSelected]}>
            <Text style={styles.timeBadgeText}>{timeLeft}</Text>
          </View>
        )}

        <View style={styles.contentRow}>
          {/* Кружок з іконкою */}
          <View
            style={[
              styles.iconCircle,
              isSelected ? styles.iconCircleSelected : isHot ? styles.iconCircleHot : styles.iconCircleNormal,
            ]}
          >
            <MaterialCommunityIcons
              name={iconName}
              size={15}
              color={isSelected ? '#10B981' : isHot ? '#EA580C' : '#006C49'}
            />
          </View>

          {/* Текст нагороди */}
          <Text
            style={[
              styles.badgeText,
              isSelected && styles.badgeTextSelected,
            ]}
          >
            {badge}
          </Text>
        </View>

        {/* Хвостик знизу бабла */}
        <View
          style={[
            styles.tail,
            isSelected && styles.tailSelected,
          ]}
        />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 8,
  },
  pulseRing: {
    position: 'absolute',
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#FED7AA',
    zIndex: 1,
  },
  bubbleWrapper: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    paddingHorizontal: 8,
    paddingVertical: 5,
    flexDirection: 'column',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.16,
    shadowRadius: 8,
    elevation: 6,
    borderWidth: 2,
    borderColor: '#FFFFFF',
    zIndex: 2,
  },
  bubbleSelected: {
    backgroundColor: '#10B981',
    borderColor: '#34D399',
    shadowColor: '#10B981',
    shadowOpacity: 0.35,
    shadowRadius: 12,
  },
  timeBadge: {
    position: 'absolute',
    top: -10,
    backgroundColor: '#EA580C',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FFFFFF',
  },
  timeBadgeSelected: {
    backgroundColor: '#FFC329',
    borderColor: '#059669',
  },
  timeBadgeText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '800',
  },
  contentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  iconCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconCircleNormal: {
    backgroundColor: '#E6FBF2',
  },
  iconCircleHot: {
    backgroundColor: '#FFEDD5',
  },
  iconCircleSelected: {
    backgroundColor: '#FFFFFF',
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#1A1B22',
    paddingRight: 2,
  },
  badgeTextSelected: {
    color: '#FFFFFF',
  },
  tail: {
    position: 'absolute',
    bottom: -6,
    width: 0,
    height: 0,
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderTopWidth: 6,
    borderStyle: 'solid',
    backgroundColor: 'transparent',
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: '#FFFFFF',
  },
  tailSelected: {
    borderTopColor: '#10B981',
  },
});