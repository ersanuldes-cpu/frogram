import React, { useEffect, useRef, useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSequence,
  withDelay,
  withRepeat,
  Easing,
  runOnJS,
} from 'react-native-reanimated';
import Svg, { Circle, Ellipse, Path, G, Rect } from 'react-native-svg';
import { colors } from '../utils/theme';
import api from '../utils/api';
import { useAuthStore } from '../store/authStore';

const AnimatedView = Animated.View;

interface FrogMascotProps {
  size?: number;
  showBadge?: boolean;
  onPress?: () => void;
}

export default function FrogMascot({ size = 40, showBadge = false, onPress }: FrogMascotProps) {
  const { isAuthenticated } = useAuthStore();
  const [eyesClosed, setEyesClosed] = useState(false);
  const [showCroak, setShowCroak] = useState(false);
  const [lastNotifCount, setLastNotifCount] = useState(0);
  const [notifCount, setNotifCount] = useState(0);

  // Animation values
  const jumpY = useSharedValue(0);
  const scaleX = useSharedValue(1);
  const scaleY = useSharedValue(1);
  const croakOpacity = useSharedValue(0);
  const croakScale = useSharedValue(0.5);

  // Blink every 10 seconds — double-blink pattern for visibility
  useEffect(() => {
    const doBlink = () => {
      // First blink
      setEyesClosed(true);
      setTimeout(() => {
        setEyesClosed(false);
        // Pause then second blink
        setTimeout(() => {
          setEyesClosed(true);
          setTimeout(() => setEyesClosed(false), 350);
        }, 250);
      }, 350);
    };

    const blinkInterval = setInterval(doBlink, 10000);

    // Initial blink after 2 seconds so user sees it early
    const initialBlink = setTimeout(doBlink, 2000);

    return () => {
      clearInterval(blinkInterval);
      clearTimeout(initialBlink);
    };
  }, []);

  // Poll for notifications
  useEffect(() => {
    if (!isAuthenticated) return;

    const checkNotifications = async () => {
      try {
        const response = await api.get('/notifications/count');
        const newCount = response.data.count || 0;
        setNotifCount(newCount);
        if (newCount > lastNotifCount && lastNotifCount > 0) {
          triggerJumpAndCroak();
        }
        setLastNotifCount(newCount);
      } catch (error) {
        // Silently fail - notifications are optional
      }
    };

    checkNotifications();
    const pollInterval = setInterval(checkNotifications, 15000);
    return () => clearInterval(pollInterval);
  }, [isAuthenticated, lastNotifCount]);

  const triggerJumpAndCroak = useCallback(() => {
    // Jump animation
    jumpY.value = withSequence(
      withTiming(-15, { duration: 150, easing: Easing.out(Easing.quad) }),
      withTiming(0, { duration: 200, easing: Easing.bounce }),
      withDelay(300, withTiming(-10, { duration: 120, easing: Easing.out(Easing.quad) })),
      withTiming(0, { duration: 180, easing: Easing.bounce })
    );

    // Squash and stretch
    scaleX.value = withSequence(
      withTiming(1.2, { duration: 100 }),
      withTiming(0.9, { duration: 150 }),
      withTiming(1, { duration: 200 })
    );
    scaleY.value = withSequence(
      withTiming(0.8, { duration: 100 }),
      withTiming(1.15, { duration: 150 }),
      withTiming(1, { duration: 200 })
    );

    // Croak bubble
    setShowCroak(true);
    croakOpacity.value = withSequence(
      withTiming(1, { duration: 150 }),
      withDelay(1200, withTiming(0, { duration: 300 }))
    );
    croakScale.value = withSequence(
      withTiming(1, { duration: 200, easing: Easing.out(Easing.back(2)) }),
      withDelay(1200, withTiming(0.5, { duration: 200 }))
    );

    setTimeout(() => setShowCroak(false), 2000);
  }, []);

  // For testing: tap frog to trigger onPress callback
  const handlePress = () => {
    if (onPress) {
      onPress();
    }
  };

  const animatedFrogStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: jumpY.value },
      { scaleX: scaleX.value },
      { scaleY: scaleY.value },
    ],
  }));

  const animatedCroakStyle = useAnimatedStyle(() => ({
    opacity: croakOpacity.value,
    transform: [{ scale: croakScale.value }],
  }));

  const s = size; // frog size
  const eyeR = s * 0.22;
  const pupilR = s * 0.09;
  const bodyW = s * 0.9;
  const bodyH = s * 0.55;

  return (
    <TouchableOpacity onPress={handlePress} activeOpacity={0.7} style={styles.container}>
      {/* Notification badge */}
      {showBadge && notifCount > 0 && (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{notifCount > 9 ? '9+' : notifCount}</Text>
        </View>
      )}

      <AnimatedView style={animatedFrogStyle}>
        <Svg
          width={s}
          height={s}
          viewBox={`0 0 ${s} ${s}`}
        >
          {/* Body */}
          <Ellipse
            cx={s / 2}
            cy={s * 0.62}
            rx={bodyW / 2}
            ry={bodyH / 2}
            fill="#4CAF50"
            stroke="#2E7D32"
            strokeWidth={1.5}
          />

          {/* Belly */}
          <Ellipse
            cx={s / 2}
            cy={s * 0.68}
            rx={bodyW * 0.35}
            ry={bodyH * 0.3}
            fill="#81C784"
          />

          {/* Left leg */}
          <Ellipse
            cx={s * 0.22}
            cy={s * 0.82}
            rx={s * 0.14}
            ry={s * 0.08}
            fill="#388E3C"
            stroke="#2E7D32"
            strokeWidth={1}
          />

          {/* Right leg */}
          <Ellipse
            cx={s * 0.78}
            cy={s * 0.82}
            rx={s * 0.14}
            ry={s * 0.08}
            fill="#388E3C"
            stroke="#2E7D32"
            strokeWidth={1}
          />

          {/* Left arm */}
          <Ellipse
            cx={s * 0.15}
            cy={s * 0.62}
            rx={s * 0.08}
            ry={s * 0.06}
            fill="#388E3C"
            stroke="#2E7D32"
            strokeWidth={1}
          />

          {/* Right arm */}
          <Ellipse
            cx={s * 0.85}
            cy={s * 0.62}
            rx={s * 0.08}
            ry={s * 0.06}
            fill="#388E3C"
            stroke="#2E7D32"
            strokeWidth={1}
          />

          {/* Head (top half) */}
          <Ellipse
            cx={s / 2}
            cy={s * 0.42}
            rx={s * 0.4}
            ry={s * 0.22}
            fill="#4CAF50"
            stroke="#2E7D32"
            strokeWidth={1.5}
          />

          {/* Left eye bulge */}
          <Circle
            cx={s * 0.35}
            cy={s * 0.28}
            r={eyeR}
            fill="#FFFFFF"
            stroke="#2E7D32"
            strokeWidth={1.5}
          />

          {/* Right eye bulge */}
          <Circle
            cx={s * 0.65}
            cy={s * 0.28}
            r={eyeR}
            fill="#FFFFFF"
            stroke="#2E7D32"
            strokeWidth={1.5}
          />

          {/* Left pupil / closed eye */}
          {eyesClosed ? (
            <Path
              d={`M ${s * 0.28} ${s * 0.28} L ${s * 0.42} ${s * 0.28}`}
              stroke="#2E7D32"
              strokeWidth={2}
              strokeLinecap="round"
            />
          ) : (
            <Circle
              cx={s * 0.36}
              cy={s * 0.28}
              r={pupilR}
              fill="#1B5E20"
            />
          )}

          {/* Right pupil / closed eye */}
          {eyesClosed ? (
            <Path
              d={`M ${s * 0.58} ${s * 0.28} L ${s * 0.72} ${s * 0.28}`}
              stroke="#2E7D32"
              strokeWidth={2}
              strokeLinecap="round"
            />
          ) : (
            <Circle
              cx={s * 0.66}
              cy={s * 0.28}
              r={pupilR}
              fill="#1B5E20"
            />
          )}

          {/* Eye highlights */}
          {!eyesClosed && (
            <>
              <Circle cx={s * 0.34} cy={s * 0.25} r={pupilR * 0.4} fill="white" />
              <Circle cx={s * 0.64} cy={s * 0.25} r={pupilR * 0.4} fill="white" />
            </>
          )}

          {/* Nostrils */}
          <Circle cx={s * 0.43} cy={s * 0.4} r={s * 0.02} fill="#2E7D32" />
          <Circle cx={s * 0.57} cy={s * 0.4} r={s * 0.02} fill="#2E7D32" />

          {/* Mouth (smile) */}
          <Path
            d={`M ${s * 0.35} ${s * 0.47} Q ${s * 0.5} ${s * 0.53} ${s * 0.65} ${s * 0.47}`}
            stroke="#2E7D32"
            strokeWidth={1.2}
            fill="none"
            strokeLinecap="round"
          />
        </Svg>
      </AnimatedView>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    alignItems: 'center',
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -6,
    backgroundColor: '#E53935',
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
    zIndex: 20,
    borderWidth: 1.5,
    borderColor: '#121212',
  },
  badgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: 'bold',
    textAlign: 'center',
  },
});
