/**
 * HapticLegend.js
 *
 * Interactive feedback key — tap any row to preview its haptic + sound.
 */

import { useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import soundEngine from '../utils/soundEngine';

// ─── Preview definitions ──────────────────────────────────────────────────────

const SECTIONS = [
  {
    id: 'intensity',
    heading: 'Vibration — slope',
    rows: [
      {
        icon: '〰',
        label: 'Flat',
        detail: 'Gentle tap',
        preview: () => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          soundEngine.playTone({ toneFreq: 261, toneVol: 0.35, toneWave: 'sine', delay: 160 });
        },
      },
      {
        icon: '📈',
        label: 'Slope',
        detail: 'Medium pulse',
        preview: () => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          soundEngine.playTone({ toneFreq: 392, toneVol: 0.5, toneWave: 'sine', delay: 90 });
        },
      },
      {
        icon: '⚡',
        label: 'Steep',
        detail: 'Strong buzz',
        preview: () => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
          soundEngine.playTone({ toneFreq: 523, toneVol: 0.7, toneWave: 'triangle', delay: 35 });
        },
      },
    ],
  },
  {
    id: 'speed',
    heading: 'Pulse speed — curvature',
    rows: [
      {
        icon: '🐢',
        label: 'Slow',
        detail: '160 ms apart',
        preview: () => {
          const fire = () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          fire();
          setTimeout(fire, 160);
          soundEngine.playTone({ toneFreq: 330, toneVol: 0.4, toneWave: 'sine', delay: 160 });
        },
      },
      {
        icon: '🚶',
        label: 'Medium',
        detail: '90 ms apart',
        preview: () => {
          const fire = () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          fire(); setTimeout(fire, 90); setTimeout(fire, 180);
          soundEngine.playTone({ toneFreq: 392, toneVol: 0.5, toneWave: 'sine', delay: 90 });
        },
      },
      {
        icon: '🏃',
        label: 'Rapid',
        detail: '35 ms apart',
        preview: () => {
          const fire = () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
          [0, 35, 70, 105].forEach(t => setTimeout(fire, t));
          soundEngine.playTone({ toneFreq: 523, toneVol: 0.65, toneWave: 'square', delay: 35 });
        },
      },
    ],
  },
  {
    id: 'events',
    heading: 'Landmarks',
    rows: [
      {
        icon: '🔔',
        label: 'Peak',
        detail: 'Local maximum',
        preview: () => {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          soundEngine.playFeature('peak');
        },
      },
      {
        icon: '⚠️',
        label: 'Valley',
        detail: 'Local minimum',
        preview: () => {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
          soundEngine.playFeature('valley');
        },
      },
      {
        icon: '✦',
        label: 'Zero',
        detail: 'Crosses y = 0',
        preview: () => {
          Haptics.selectionAsync();
          soundEngine.playFeature('zeroCrossing');
        },
      },
      {
        icon: '🚧',
        label: 'Asymptote',
        detail: 'Function → ±∞',
        preview: () => {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
          soundEngine.playFeature('asymptote');
        },
      },
    ],
  },
];

// ─── Row ──────────────────────────────────────────────────────────────────────

function LegendRow({ icon, label, detail, preview }) {
  const [active, setActive] = useState(false);

  function handlePress() {
    setActive(true);
    preview?.();
    setTimeout(() => setActive(false), 300);
  }

  return (
    <Pressable
      onPress={handlePress}
      style={({ pressed }) => [styles.row, (pressed || active) && styles.rowActive]}
      accessibilityRole="button"
      accessibilityLabel={`Preview ${label} feedback`}>
      <Text style={styles.rowIcon}>{icon}</Text>
      <View style={styles.rowText}>
        <Text style={styles.rowLabel}>{label}</Text>
        <Text style={styles.rowDetail}>{detail}</Text>
      </View>
      <Text style={[styles.playHint, active && styles.playHintActive]}>▶</Text>
    </Pressable>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function HapticLegend() {
  const [open, setOpen] = useState(false);
  const rotateAnim = useRef(new Animated.Value(0)).current;

  function toggle() {
    Animated.timing(rotateAnim, {
      toValue: open ? 0 : 1,
      duration: 200,
      useNativeDriver: true,
    }).start();
    setOpen(!open);
  }

  const chevronRotate = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '180deg'],
  });

  return (
    <View style={styles.root}>
      <Pressable
        onPress={toggle}
        style={({ pressed }) => [styles.toggle, pressed && styles.togglePressed]}
        accessibilityRole="button"
        accessibilityLabel="Feedback key"
        accessibilityState={{ expanded: open }}>
        <Text style={styles.toggleIcon}>🎛</Text>
        <Text style={styles.toggleLabel}>Feedback Key</Text>
        <Text style={styles.toggleHint}>tap to preview</Text>
        <Animated.Text style={[styles.chevron, { transform: [{ rotate: chevronRotate }] }]}>
          ▾
        </Animated.Text>
      </Pressable>

      {open && (
        <View style={styles.body}>
          {SECTIONS.map((s) => (
            <View key={s.id} style={styles.section}>
              <Text style={styles.sectionHeading}>{s.heading}</Text>
              {s.rows.map((r) => (
                <LegendRow key={r.label} {...r} />
              ))}
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const C = {
  surface:    '#1a1d2e',
  border:     '#2e3248',
  primary:    '#4f9eff',
  text:       '#e8eaf6',
  textSub:    '#9fa8c0',
  textMuted:  '#5a6080',
  active:     '#1e3a5f',
};

const styles = StyleSheet.create({
  root: {
    marginTop: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.surface,
    overflow: 'hidden',
  },
  toggle: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
    gap: 8,
  },
  togglePressed: { backgroundColor: '#222638' },
  toggleIcon:   { fontSize: 16 },
  toggleLabel:  { flex: 1, fontSize: 14, fontWeight: '600', color: C.textSub },
  toggleHint:   { fontSize: 11, color: C.textMuted, fontStyle: 'italic' },
  chevron:      { fontSize: 14, color: C.textMuted },

  body: {
    borderTopWidth: 1,
    borderTopColor: C.border,
    paddingHorizontal: 10,
    paddingTop: 10,
    paddingBottom: 14,
    gap: 14,
  },

  section: { gap: 2 },
  sectionHeading: {
    fontSize: 11,
    fontWeight: '700',
    color: C.primary,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginBottom: 6,
  },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 8,
  },
  rowActive:      { backgroundColor: C.active },
  rowIcon:        { fontSize: 18, width: 26, textAlign: 'center' },
  rowText:        { flex: 1 },
  rowLabel:       { fontSize: 13, fontWeight: '600', color: C.text },
  rowDetail:      { fontSize: 11, color: C.textSub },
  playHint:       { fontSize: 12, color: C.textMuted },
  playHintActive: { color: C.primary },
});
