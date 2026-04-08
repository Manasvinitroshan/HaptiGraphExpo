/**
 * SplashScreen.js
 *
 * Animated intro screen shown on app launch.
 * Auto-dismisses after ~2.6 s (fade-in → hold → fade-out).
 * Tap anywhere to skip.
 */

import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

// ─── Mini sine-wave visualiser ────────────────────────────────────────────────

const WAVE_POINTS = 12;

/** Pre-computed y-positions that trace one full sine arch */
const WAVE_Y = Array.from({ length: WAVE_POINTS }, (_, i) => {
  const t = (i / (WAVE_POINTS - 1)) * Math.PI * 2;
  return Math.sin(t);                     // –1 … +1
});

function WaveBar({ index, masterAnim }) {
  const DOT_AREA  = 34;                   // total height budget per dot
  const MAX_SHIFT = DOT_AREA * 0.4;       // maximum vertical travel

  // Each dot animates with a slight phase offset for a ripple feel
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const delay = index * 55;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(anim, {
          toValue: 1,
          duration: 600,
          useNativeDriver: true,
        }),
        Animated.timing(anim, {
          toValue: 0,
          duration: 600,
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [anim, index]);

  const translateY = anim.interpolate({
    inputRange:  [0, 1],
    outputRange: [WAVE_Y[index] * MAX_SHIFT, -WAVE_Y[index] * MAX_SHIFT],
  });

  return (
    <Animated.View
      style={[
        styles.waveDot,
        { transform: [{ translateY }] },
      ]}
    />
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function SplashScreen({ onFinish }) {
  const fadeAnim  = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(18)).current;

  useEffect(() => {
    // Fade + slide in
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 700,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 700,
        useNativeDriver: true,
      }),
    ]).start();

    // Auto-dismiss after 2.6 s
    const timer = setTimeout(dismiss, 2600);
    return () => clearTimeout(timer);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function dismiss() {
    Animated.timing(fadeAnim, {
      toValue: 0,
      duration: 450,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) onFinish?.();
    });
  }

  return (
    <Pressable style={styles.root} onPress={dismiss} accessible={false}>
      <Animated.View
        style={[
          styles.inner,
          { opacity: fadeAnim, transform: [{ translateY: slideAnim }] },
        ]}>

        {/* Wave visualiser */}
        <View style={styles.waveRow}>
          {Array.from({ length: WAVE_POINTS }, (_, i) => (
            <WaveBar key={i} index={i} masterAnim={fadeAnim} />
          ))}
        </View>

        {/* App name */}
        <Text style={styles.appName}>HaptiGraph</Text>

        {/* Tagline */}
        <Text style={styles.tagline}>Feel the math. Learn through touch.</Text>

        {/* Dismiss hint */}
        <Text style={styles.hint}>Tap anywhere to continue</Text>
      </Animated.View>
    </Pressable>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#0f1117',
    alignItems: 'center',
    justifyContent: 'center',
  },
  inner: {
    alignItems: 'center',
    paddingHorizontal: 32,
  },

  // Wave
  waveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 56,
    gap: 6,
    marginBottom: 32,
  },
  waveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#4f9eff',
    shadowColor: '#4f9eff',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 4,
  },

  // Text
  appName: {
    fontSize: 42,
    fontWeight: '800',
    color: '#e8eaf6',
    letterSpacing: 1,
    marginBottom: 12,
  },
  tagline: {
    fontSize: 16,
    color: '#9fa8c0',
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 56,
  },
  hint: {
    fontSize: 12,
    color: '#3a4060',
    letterSpacing: 0.5,
  },
});
