/**
 * HapticController.js
 *
 * Two responsibilities:
 *
 *  1. LOGIC LAYER (named exports — pure/stateless):
 *       buildHapticSequence(graphData) → HapticEvent[]
 *       playHapticEvent(event)
 *
 *     Used by useHaptics.js to drive the async playback loop.
 *
 *  2. UI LAYER (default export):
 *       <HapticController graphData onStatusChange? />
 *
 *     Renders play / pause / stop controls and a progress bar.
 *     Internally consumes useHaptics — parent only provides graphData.
 *
 * HapticEvent shape:
 *   {
 *     type:     string,   // react-native-haptic-feedback trigger name
 *     delay:    number,   // ms to wait AFTER this event before the next
 *     feature?: string,   // 'peak' | 'valley' | 'zeroCrossing' | undefined
 *   }
 */

import { Pressable, StyleSheet, Text, View } from 'react-native';

// ─── UI: HapticController component ──────────────────────────────────────────

/**
 * Play / pause / stop controls with a progress bar.
 * Receives haptic state + actions from parent (LearningScreen owns useHaptics).
 *
 * Props:
 *   graphData   object   output of parseEquationAdvanced()
 *   haptics     object   return value of useHaptics()
 */
export default function HapticController({ graphData, haptics }) {
  const {
    isPlaying,
    isPaused,
    progress,
    statusLabel,
    startHaptics,
    stopHaptics,
    pauseHaptics,
    resumeHaptics,
  } = haptics;

  const canPlay   = !!graphData?.points?.length;
  const canStop   = isPlaying || isPaused;
  const canPause  = isPlaying && !isPaused;
  const canResume = isPlaying && isPaused;

  return (
    <View style={styles.root}>

      {/* ── Progress bar ────────────────────────────────────────────────── */}
      <View style={styles.progressTrack}
        accessibilityRole="progressbar"
        accessibilityValue={{ min: 0, max: 100, now: Math.round(progress * 100) }}>
        <View style={[styles.progressFill, { width: `${Math.round(progress * 100)}%` }]} />
      </View>

      {/* ── Status text ─────────────────────────────────────────────────── */}
      <Text style={styles.statusText}
        accessibilityLiveRegion="polite"
        accessibilityLabel={`Haptic status: ${statusLabel}`}>
        {statusLabel}
      </Text>

      {/* ── Controls ────────────────────────────────────────────────────── */}
      <View style={styles.controls}>
        {canResume ? (
          <ControlBtn label="Resume" icon="▶" color={C.play}
            onPress={resumeHaptics}
            a11y="Resume haptic playback" />
        ) : (
          <ControlBtn label="Play" icon="▶" color={C.play}
            onPress={() => startHaptics(graphData)}
            disabled={!canPlay || isPlaying}
            a11y={canPlay ? 'Play haptic graph' : 'Generate a graph first'} />
        )}

        <ControlBtn label="Pause" icon="⏸" color={C.pause}
          onPress={pauseHaptics}
          disabled={!canPause}
          a11y="Pause haptic playback" />

        <ControlBtn label="Stop" icon="⏹" color={C.stop}
          onPress={stopHaptics}
          disabled={!canStop}
          a11y="Stop haptic playback" />
      </View>

      {/* ── Feature legend ───────────────────────────────────────────────── */}
      <View style={styles.legend}>
        <LegendRow color={C.peak}      label="Peak — success pulse" />
        <LegendRow color={C.valley}    label="Valley — warning pulse" />
        <LegendRow color={C.zero}      label="Zero crossing — subtle tick" />
        <LegendRow color={C.asymptote} label="Asymptote — rising alarm" />
      </View>

    </View>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

const ControlBtn = ({ label, icon, color, onPress, disabled = false, a11y }) => (
  <Pressable
    onPress={onPress}
    disabled={disabled}
    style={({ pressed }) => [
      styles.btn,
      { borderColor: disabled ? C.disabled : color },
      pressed && !disabled && { backgroundColor: color + '22' },
      disabled && styles.btnDisabled,
    ]}
    accessibilityRole="button"
    accessibilityLabel={a11y}
    accessibilityState={{ disabled }}
    hitSlop={6}>
    <Text style={[styles.btnIcon, disabled && styles.dimmed]}>{icon}</Text>
    <Text style={[styles.btnLabel, { color: disabled ? C.disabled : color }]}>{label}</Text>
  </Pressable>
);

const LegendRow = ({ color, label }) => (
  <View style={styles.legendRow}>
    <View style={[styles.legendDot, { backgroundColor: color }]} />
    <Text style={styles.legendText}>{label}</Text>
  </View>
);

// ─── Colours ──────────────────────────────────────────────────────────────────

const C = {
  bg:       '#1a1d2e',
  border:   '#2e3248',
  track:    '#0f1117',
  fill:     '#4f9eff',
  text:     '#9fa8c0',
  disabled: '#3a3f55',
  play:     '#4fff91',
  pause:    '#4f9eff',
  stop:     '#ff4f4f',
  peak:      '#ff4f4f',
  valley:    '#4faaff',
  zero:      '#4fff91',
  asymptote: '#ff8f4f',
};

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    backgroundColor: C.bg,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.border,
    padding: 16,
    gap: 14,
  },
  progressTrack: {
    height: 4,
    backgroundColor: C.track,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: C.fill,
    borderRadius: 2,
  },
  statusText: {
    fontSize: 13,
    color: C.text,
    textAlign: 'center',
  },
  controls: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 12,
  },
  btn: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 10,
    borderWidth: 1.5,
    minWidth: 72,
    minHeight: 52,
    gap: 3,
  },
  btnDisabled: {
    opacity: 0.4,
  },
  btnIcon: {
    fontSize: 16,
    color: '#e8eaf6',
  },
  btnLabel: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  dimmed: {
    color: C.disabled,
  },
  legend: {
    gap: 6,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: C.border,
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendText: {
    fontSize: 11,
    color: C.text,
  },
});
