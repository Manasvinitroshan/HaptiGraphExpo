/**
 * hapticEngine.js
 *
 * Pure logic layer — no React, no UI.
 * Extracted here to break the circular dependency between
 * HapticController (UI) ↔ useHaptics (hook).
 *
 * Exports:
 *   buildHapticSequence(graphData) → HapticEvent[]
 *   playHapticEvent(event)
 */

import * as Haptics from 'expo-haptics';
import {
  FEATURE_PATTERNS,
  PLAYBACK,
  curvatureToDelay,
  slopeToImpactType,
} from '../constants/hapticsConfig';

// ─── Sequence builder ─────────────────────────────────────────────────────────

/**
 * Converts structured graph data into a flat array of HapticEvents.
 *
 * Mapping rules:
 *   slope  (dy)    → impact type  (light / medium / heavy)
 *   curvature(d2y) → delay        (slow / medium / fast pulse)
 *   features       → type override + extra pause after the event
 *
 * @param {{
 *   points:    { x: number, y: number }[],
 *   slope:     { x: number, dy: number }[],
 *   curvature: { x: number, d2y: number }[],
 *   features:  { peaks: {x,y}[], valleys: {x,y}[], zeroCrossings: {x}[] }
 * }} graphData
 * @returns {{ type: string, delay: number, feature?: string }[]}
 */
export function buildHapticSequence(graphData) {
  if (!graphData?.points?.length) return [];

  const { points, slope = [], curvature = [], features = {} } = graphData;
  const { peaks = [], valleys = [], zeroCrossings = [] } = features;
  const tol = PLAYBACK.featureMatchTolerance;

  const slopeMap     = new Map(slope.map((s) => [s.x, s.dy]));
  const curvatureMap = new Map(curvature.map((c) => [c.x, c.d2y]));

  const peakXs   = peaks.map((p) => p.x);
  const valleyXs = valleys.map((v) => v.x);
  const zeroXs   = zeroCrossings.map((z) => z.x);

  const nearAny = (xs, x) => xs.some((fx) => Math.abs(fx - x) <= tol);

  const limit = Math.min(points.length, PLAYBACK.maxPoints);
  const sequence = [];

  for (let i = 0; i < limit; i++) {
    const { x } = points[i];

    const xKey = parseFloat(x.toFixed(4));
    const dy   = slopeMap.get(xKey)     ?? slopeMap.get(x)     ?? 0;
    const d2y  = curvatureMap.get(xKey) ?? curvatureMap.get(x) ?? 0;

    const baseType  = slopeToImpactType(dy);
    const baseDelay = curvatureToDelay(d2y);

    let featureKey;
    if      (nearAny(peakXs,   x)) featureKey = 'peak';
    else if (nearAny(valleyXs, x)) featureKey = 'valley';
    else if (nearAny(zeroXs,   x)) featureKey = 'zeroCrossing';

    sequence.push({
      type:      featureKey ? FEATURE_PATTERNS[featureKey] : baseType,
      delay:     featureKey ? baseDelay + PLAYBACK.featurePauseMs : baseDelay,
      feature:   featureKey,
      // Point context — consumed by adaptiveHaptics in the playback loop
      x:         points[i].x,
      y:         points[i].y,
      slope:     dy,
      curvature: d2y,
    });
  }

  return sequence;
}

// ─── Haptic player ────────────────────────────────────────────────────────────

const EXPO_HAPTIC_MAP = {
  impactLight:         () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light),
  impactMedium:        () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium),
  impactHeavy:         () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy),
  notificationSuccess: () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success),
  notificationWarning: () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning),
selection:           () => Haptics.selectionAsync(),
};

/**
 * Fires a single haptic event. Fails silently if device has no haptics.
 * @param {{ type: string }} event
 */
export function playHapticEvent(event) {
  try {
    const trigger = EXPO_HAPTIC_MAP[event.type];
    if (trigger) trigger();
  } catch {
    // Device may not support haptics — fail silently
  }
}
