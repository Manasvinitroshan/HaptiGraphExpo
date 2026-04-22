/**
 * HapticLegend.js
 *
 * Interactive feedback key — tap any row to preview its haptic + sound for 5 s.
 * Tap again to stop early. Each preview() returns a stop() cleanup function.
 */

import { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import soundEngine from '../utils/soundEngine';

const PREVIEW_DURATION = 5000;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Repeats fn every intervalMs, fires immediately. Returns stop(). */
function loop(fn, intervalMs) {
  fn();
  const id = setInterval(fn, intervalMs);
  return () => clearInterval(id);
}

/**
 * Repeats a burst pattern every cycleMs.
 * burstOffsets: array of ms offsets within a cycle to fire fn.
 * Returns stop().
 */
function burstLoop(fn, burstOffsets, cycleMs) {
  const timers = [];

  function scheduleBurst() {
    burstOffsets.forEach((offset) => {
      timers.push(setTimeout(fn, offset));
    });
  }

  scheduleBurst();
  const id = setInterval(() => {
    scheduleBurst();
  }, cycleMs);

  return () => {
    clearInterval(id);
    timers.forEach(clearTimeout);
  };
}

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
        preview: () => loop(() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          soundEngine.playTone({ toneFreq: 261, toneVol: 0.35, toneWave: 'sine', delay: 160 });
        }, 160),
      },
      {
        icon: '📈',
        label: 'Slope',
        detail: 'Medium pulse',
        preview: () => loop(() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          soundEngine.playTone({ toneFreq: 392, toneVol: 0.5, toneWave: 'sine', delay: 90 });
        }, 90),
      },
      {
        icon: '⚡',
        label: 'Steep',
        detail: 'Strong buzz',
        preview: () => loop(() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
          soundEngine.playTone({ toneFreq: 523, toneVol: 0.7, toneWave: 'triangle', delay: 75 });
        }, 75),
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
        // 2-pulse burst then rest: fires at 0ms and 160ms, cycle every 700ms
        preview: () => burstLoop(() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          soundEngine.playTone({ toneFreq: 330, toneVol: 0.4, toneWave: 'sine', delay: 160 });
        }, [0, 160], 700),
      },
      {
        icon: '🚶',
        label: 'Medium',
        detail: '90 ms apart',
        // 3-pulse burst: 0, 90, 180ms, cycle every 650ms
        preview: () => burstLoop(() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          soundEngine.playTone({ toneFreq: 392, toneVol: 0.5, toneWave: 'sine', delay: 90 });
        }, [0, 90, 180], 650),
      },
      {
        icon: '🏃',
        label: 'Rapid',
        detail: '35 ms apart',
        // 4-pulse burst: 0, 50, 100, 150ms, cycle every 600ms
        preview: () => burstLoop(() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
          soundEngine.playTone({ toneFreq: 523, toneVol: 0.65, toneWave: 'square', delay: 50 });
        }, [0, 50, 100, 150], 600),
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
        preview: () => loop(() => {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          soundEngine.playFeature('peak');
        }, 1200),
      },
      {
        icon: '⚠️',
        label: 'Valley',
        detail: 'Local minimum',
        preview: () => loop(() => {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
          soundEngine.playFeature('valley');
        }, 1200),
      },
      {
        icon: '✦',
        label: 'Zero',
        detail: 'Crosses y = 0',
        preview: () => loop(() => {
          Haptics.selectionAsync();
          soundEngine.playFeature('zeroCrossing');
        }, 900),
      },
    ],
  },
];

// ─── Row ──────────────────────────────────────────────────────────────────────

function LegendRow({ icon, label, detail, preview }) {
  const [playing, setPlaying]   = useState(false);
  const [progress, setProgress] = useState(0);  // 0–1 over 5 s
  const stopRef    = useRef(null);
  const autoStopRef = useRef(null);
  const progressRef = useRef(null);

  // Clean up on unmount
  useEffect(() => () => stopAll(), []);

  function stopAll() {
    stopRef.current?.();
    clearTimeout(autoStopRef.current);
    clearInterval(progressRef.current);
    stopRef.current    = null;
    autoStopRef.current = null;
    progressRef.current = null;
  }

  function handlePress() {
    if (playing) {
      stopAll();
      setPlaying(false);
      setProgress(0);
      return;
    }

    // Start preview
    stopRef.current = preview?.();
    setPlaying(true);
    setProgress(0);

    // Tick progress bar every 50 ms
    const start = Date.now();
    progressRef.current = setInterval(() => {
      const elapsed = Date.now() - start;
      setProgress(Math.min(elapsed / PREVIEW_DURATION, 1));
    }, 50);

    // Auto-stop after 5 s
    autoStopRef.current = setTimeout(() => {
      stopAll();
      setPlaying(false);
      setProgress(0);
    }, PREVIEW_DURATION);
  }

  return (
    <Pressable
      onPress={handlePress}
      style={({ pressed }) => [styles.row, (pressed || playing) && styles.rowActive]}
      accessibilityRole="button"
      accessibilityLabel={playing ? `Stop ${label} preview` : `Preview ${label} feedback for 5 seconds`}>

      <Text style={styles.rowIcon}>{icon}</Text>

      <View style={styles.rowText}>
        <Text style={styles.rowLabel}>{label}</Text>
        <Text style={styles.rowDetail}>{detail}</Text>
        {/* Progress bar — only visible while playing */}
        {playing && (
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
          </View>
        )}
      </View>

      <Text style={[styles.playBtn, playing && styles.playBtnActive]}>
        {playing ? '■' : '▶'}
      </Text>
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
        <Text style={styles.toggleHint}>tap row to preview (5 s)</Text>
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
  rowActive:  { backgroundColor: C.active },
  rowIcon:    { fontSize: 18, width: 26, textAlign: 'center' },
  rowText:    { flex: 1 },
  rowLabel:   { fontSize: 13, fontWeight: '600', color: C.text },
  rowDetail:  { fontSize: 11, color: C.textSub, marginBottom: 3 },

  progressTrack: {
    height: 2,
    backgroundColor: '#2e3248',
    borderRadius: 1,
    overflow: 'hidden',
    marginTop: 4,
  },
  progressFill: {
    height: 2,
    backgroundColor: C.primary,
    borderRadius: 1,
  },

  playBtn:       { fontSize: 13, color: C.textMuted, width: 16, textAlign: 'center' },
  playBtnActive: { color: C.primary },
});
