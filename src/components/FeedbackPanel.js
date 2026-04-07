/**
 * FeedbackPanel.js
 *
 * Explicit haptic feedback buttons that directly train the user model.
 * Shown after playback starts (status !== 'idle') so the user can give
 * feedback at any point during or after a session.
 *
 * Four buttons:
 *   Too fast    → delay multipliers widen  (slower pacing)
 *   Too slow    → delay multipliers shrink (faster pacing)
 *   Too intense → light arm rewarded across all slope buckets
 *   Too weak    → heavy arm rewarded across all slope buckets
 *
 * Each press flashes a confirmation label and calls
 * userModel.applyExplicitFeedback(type).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import userModel from '../ml/userModel';

// ─── Button definitions ───────────────────────────────────────────────────────

const BUTTONS = [
  { type: 'tooFast',    label: 'Too fast',    icon: '⏩', color: '#4f9eff' },
  { type: 'tooSlow',    label: 'Too slow',    icon: '⏪', color: '#4f9eff' },
  { type: 'tooIntense', label: 'Too intense', icon: '🔇', color: '#ff4f4f' },
  { type: 'tooWeak',    label: 'Too weak',    icon: '🔊', color: '#4fff91' },
];

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * Props:
 *   visible   boolean   show/hide the panel (true once playback has started)
 */
export default function FeedbackPanel({ visible }) {
  const [confirmedType, setConfirmedType] = useState(null);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const hideTimer = useRef(null);

  // ── Confirmation flash ────────────────────────────────────────────────────────
  const showConfirmation = useCallback((type) => {
    setConfirmedType(type);
    fadeAnim.setValue(1);

    if (hideTimer.current) clearTimeout(hideTimer.current);
    Animated.timing(fadeAnim, {
      toValue:         0,
      duration:        800,
      delay:           600,
      useNativeDriver: true,
    }).start(() => setConfirmedType(null));
  }, [fadeAnim]);

  const handlePress = useCallback((type) => {
    userModel.applyExplicitFeedback(type);
    showConfirmation(type);
  }, [showConfirmation]);

  useEffect(() => {
    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, []);

  if (!visible) return null;

  const confirmedLabel = BUTTONS.find((b) => b.type === confirmedType)?.label;

  return (
    <View style={styles.root}>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <View style={styles.header}>
        <Text style={styles.title}>Haptic Feedback</Text>
        <Text style={styles.subtitle}>Tell the engine how to adjust</Text>
      </View>

      {/* ── Buttons (2 × 2 grid) ──────────────────────────────────────────── */}
      <View style={styles.grid}>
        {BUTTONS.map((btn) => (
          <FeedbackBtn
            key={btn.type}
            label={btn.label}
            icon={btn.icon}
            color={btn.color}
            onPress={() => handlePress(btn.type)}
            active={confirmedType === btn.type}
          />
        ))}
      </View>

      {/* ── Confirmation toast ────────────────────────────────────────────── */}
      <Animated.View style={[styles.toast, { opacity: fadeAnim }]}
        pointerEvents="none">
        <Text style={styles.toastText}>
          {confirmedLabel ? `✓ Applied — ${confirmedLabel}` : ''}
        </Text>
      </Animated.View>

    </View>
  );
}

// ─── Sub-component ────────────────────────────────────────────────────────────

const FeedbackBtn = ({ label, icon, color, onPress, active }) => (
  <Pressable
    onPress={onPress}
    style={({ pressed }) => [
      styles.btn,
      { borderColor: color },
      (pressed || active) && { backgroundColor: color + '22' },
    ]}
    accessibilityRole="button"
    accessibilityLabel={label}
    hitSlop={4}>
    <Text style={styles.btnIcon}>{icon}</Text>
    <Text style={[styles.btnLabel, { color }]}>{label}</Text>
  </Pressable>
);

// ─── Styles ───────────────────────────────────────────────────────────────────

const C = {
  bg:     '#1a1d2e',
  border: '#2e3248',
  text:   '#9fa8c0',
  dim:    '#4a5068',
};

const styles = StyleSheet.create({
  root: {
    backgroundColor: C.bg,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.border,
    padding: 16,
    gap: 12,
  },
  header: {
    gap: 2,
  },
  title: {
    fontSize: 13,
    fontWeight: '700',
    color: '#e8eaf6',
    letterSpacing: 0.3,
  },
  subtitle: {
    fontSize: 11,
    color: C.text,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  btn: {
    flexBasis: '47%',
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderWidth: 1.5,
    gap: 4,
  },
  btnIcon: {
    fontSize: 18,
  },
  btnLabel: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  toast: {
    alignItems: 'center',
    paddingTop: 2,
  },
  toastText: {
    fontSize: 12,
    color: '#4fff91',
    fontWeight: '600',
  },
});
