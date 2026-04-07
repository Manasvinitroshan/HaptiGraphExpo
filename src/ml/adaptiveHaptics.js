/**
 * adaptiveHaptics.js
 *
 * Main adaptive entry point for the ML personalization pipeline.
 *
 * Role in pipeline:
 *   This module is the decision layer — it is called once per point in the
 *   playback loop. It merges the static rule-based baseline (from hapticsConfig)
 *   with the live user model (userModel.js) to produce a single haptic
 *   descriptor {type, delay, feature, adapted} for that point.
 *
 *   Blending logic:
 *     - confidence < MIN_CONFIDENCE_FOR_ADAPTATION → pure baseline (cold start)
 *     - MIN_CONFIDENCE_FOR_ADAPTATION ≤ confidence < 0.5 → adapted delay only,
 *       baseline type (model has some data but not enough to trust type selection)
 *     - confidence ≥ 0.5 → full adaptation (both type and delay are model-driven)
 *     - Delay is always linearly interpolated between baseline and adapted using
 *       the confidence value as the lerp weight.
 *     - Feature haptics (peak / valley / zero crossing) always use the baseline
 *       pattern — they carry semantic meaning and must not be overridden.
 *
 * This file exports only pure functions. It has no mutable state of its own;
 * all state lives in the userModel singleton.
 */

import {
  FEATURE_PATTERNS,
  PLAYBACK,
  DELAY_MS,
  curvatureToDelay,
  slopeToImpactType,
} from '../constants/hapticsConfig';
import userModel from './userModel';

// ─── Constants ────────────────────────────────────────────────────────────────

/** Maps bandit arm index to haptic impact type string. */
const ARM_TO_TYPE = ['impactLight', 'impactMedium', 'impactHeavy'];

/**
 * Minimum confidence score required before model output is blended in.
 * Below this threshold the function always returns pure baseline values.
 */
const MIN_CONFIDENCE_FOR_ADAPTATION = 0.2;

// ─── Math Helpers ─────────────────────────────────────────────────────────────

/**
 * Linear interpolation between two numbers.
 * @param {number} a  Start value (t = 0).
 * @param {number} b  End value   (t = 1).
 * @param {number} t  Blend factor, typically in [0, 1].
 * @returns {number}
 */
function lerp(a, b, t) {
  return a + (b - a) * t;
}

/**
 * Clamps a value to [min, max].
 * @param {number} value
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

// ─── Exported Functions ───────────────────────────────────────────────────────

/**
 * Computes the adaptive haptic descriptor for a single graph point.
 *
 * This is the hot-path function called from the playback loop. It must
 * never throw — all bad input is handled gracefully.
 *
 * Adaptation is suppressed when a featureKey is present (peaks, valleys,
 * zero crossings) because these carry perceptual semantics that the user
 * has already learned, and overriding them would break the haptic language.
 *
 * @param {{
 *   x:         number,
 *   y:         number,
 *   slope:     number,    // dy at this point
 *   curvature: number,    // d2y at this point
 * }} context
 * @param {string|undefined} featureKey  Optional: 'peak' | 'valley' | 'zeroCrossing'
 *
 * @returns {{
 *   type:     string,            // haptic trigger name
 *   delay:    number,            // milliseconds
 *   feature:  string|undefined,  // featureKey if set
 *   adapted:  boolean,           // true if model influenced the output
 * }}
 */
export function getAdaptiveHaptic(context, featureKey) {
  // ── Guard: bad input returns a safe fallback ──────────────────────────────
  if (!context || typeof context !== 'object') {
    return { type: 'impactLight', delay: DELAY_MS.medium, feature: undefined, adapted: false };
  }

  const slope     = context.slope     ?? 0;
  const curvature = context.curvature ?? 0;

  // ── Step 1: Baseline values ───────────────────────────────────────────────
  const baseType  = slopeToImpactType(slope);
  let   baseDelay = curvatureToDelay(curvature);

  // ── Step 2: Feature override (always beats adaptation) ────────────────────
  let resolvedFeature;
  if (featureKey && FEATURE_PATTERNS[featureKey]) {
    resolvedFeature = featureKey;
    baseDelay      += PLAYBACK.featurePauseMs;
  }

  // ── Step 3: Check if adaptation is applicable ─────────────────────────────
  const confidence = userModel.getConfidence();

  const shouldAdapt =
    confidence >= MIN_CONFIDENCE_FOR_ADAPTATION && !resolvedFeature;

  if (!shouldAdapt) {
    return {
      type:    resolvedFeature ? FEATURE_PATTERNS[resolvedFeature] : baseType,
      delay:   clamp(baseDelay, DELAY_MS.min, DELAY_MS.max),
      feature: resolvedFeature,
      adapted: false,
    };
  }

  // ── Step 4: Compute adapted values ────────────────────────────────────────
  const absSlopeVal     = Math.abs(slope);
  const absCurvatureVal = Math.abs(curvature);

  const adaptedType  = userModel.getOptimalIntensityType(absSlopeVal);
  const multiplier   = userModel.getDelayMultiplier(absCurvatureVal);
  const adaptedDelay = clamp(baseDelay * multiplier, DELAY_MS.min, DELAY_MS.max);

  // ── Step 5: Blend ─────────────────────────────────────────────────────────
  // Type:  use baseline until confidence ≥ 0.5 (model needs more data for
  //        reliable arm selection), then switch to adapted type.
  const finalType = confidence >= 0.5 ? adaptedType : baseType;

  // Delay: always lerp — even small confidence shifts timing slightly.
  const finalDelay = clamp(
    Math.round(lerp(baseDelay, adaptedDelay, confidence)),
    DELAY_MS.min,
    DELAY_MS.max,
  );

  return {
    type:    finalType,
    delay:   finalDelay,
    feature: undefined,
    adapted: true,
  };
}

/**
 * Computes the pure baseline haptic descriptor for a single graph point,
 * with no model involvement.
 *
 * Use this as a cold-start fallback or for A/B testing against the adaptive
 * path. The output is identical to what buildHapticSequence() would produce
 * for the same point in hapticEngine.js.
 *
 * @param {{
 *   x:         number,
 *   y:         number,
 *   slope:     number,
 *   curvature: number,
 * }} context
 * @param {string|undefined} featureKey  Optional: 'peak' | 'valley' | 'zeroCrossing'
 *
 * @returns {{
 *   type:     string,
 *   delay:    number,
 *   feature:  string|undefined,
 *   adapted:  false,
 * }}
 */
export function getBaselineHaptic(context, featureKey) {
  if (!context || typeof context !== 'object') {
    return { type: 'impactLight', delay: DELAY_MS.medium, feature: undefined, adapted: false };
  }

  const slope     = context.slope     ?? 0;
  const curvature = context.curvature ?? 0;

  const baseType  = slopeToImpactType(slope);
  let   baseDelay = curvatureToDelay(curvature);

  let resolvedFeature;
  if (featureKey && FEATURE_PATTERNS[featureKey]) {
    resolvedFeature = featureKey;
    baseDelay      += PLAYBACK.featurePauseMs;
  }

  return {
    type:    resolvedFeature ? FEATURE_PATTERNS[resolvedFeature] : baseType,
    delay:   clamp(baseDelay, DELAY_MS.min, DELAY_MS.max),
    feature: resolvedFeature,
    adapted: false,
  };
}
