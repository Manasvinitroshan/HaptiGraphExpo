/**
 * hapticsConfig.js
 *
 * Semantic mappings between mathematical graph properties and haptic signals.
 *
 * Design philosophy:
 *   - slope     → INTENSITY   (how hard the vibration hits)
 *   - curvature → TEMPO       (how fast pulses arrive)
 *   - features  → PATTERN     (special named haptic events at landmarks)
 *
 * All thresholds operate on absolute values (slope/curvature can be negative).
 */

// ─── Slope → Impact Type ──────────────────────────────────────────────────────

/**
 * |dy| thresholds selecting the haptic impact weight.
 *
 *  flat region    → impactLight   (graph is nearly horizontal)
 *  rising/falling → impactMedium  (noticeable directional change)
 *  steep          → impactHeavy   (aggressive slope)
 */
export const SLOPE_THRESHOLDS = {
  light:  2.0,   // |dy| < 2   → impactLight
  medium: 6.0,   // |dy| < 6   → impactMedium
  //              |dy| >= 6  → impactHeavy
};

/**
 * Maps a slope value (dy) to a react-native-haptic-feedback impact type.
 * @param {number} dy
 * @returns {'impactLight'|'impactMedium'|'impactHeavy'}
 */
export function slopeToImpactType(dy) {
  const abs = Math.abs(dy ?? 0);
  if (abs < SLOPE_THRESHOLDS.light)  return 'impactLight';
  if (abs < SLOPE_THRESHOLDS.medium) return 'impactMedium';
  return 'impactHeavy';
}

// ─── Curvature → Delay (ms) ───────────────────────────────────────────────────

/**
 * |d2y| thresholds controlling pulse spacing in milliseconds.
 *
 *  flat curve    → slow pulse    (long delay — calm traversal)
 *  moderate bend → medium pulse  (comfortable pacing)
 *  sharp curve   → fast pulse    (rapid-fire — conveys sudden change)
 */
export const CURVATURE_THRESHOLDS = {
  flat:     1.0,   // |d2y| < 1   → slow
  moderate: 5.0,   // |d2y| < 5   → medium
  //               |d2y| >= 5 → fast
};

export const DELAY_MS = {
  slow:   160,   // flat region   — leisurely
  medium:  90,   // moderate bend — comfortable
  fast:    35,   // sharp curve   — urgent
  min:     25,   // hard floor    — never faster than this
  max:    250,   // hard ceiling  — never slower than this
};

/**
 * Maps a curvature value (d2y) to a delay in milliseconds.
 * @param {number} d2y
 * @returns {number}
 */
export function curvatureToDelay(d2y) {
  const abs = Math.abs(d2y ?? 0);
  if (abs < CURVATURE_THRESHOLDS.flat)     return DELAY_MS.slow;
  if (abs < CURVATURE_THRESHOLDS.moderate) return DELAY_MS.medium;
  return DELAY_MS.fast;
}

// ─── Feature → Named Haptic Pattern ───────────────────────────────────────────

/**
 * Graph landmarks map to distinct named haptic events so users can identify
 * structural features by feel alone — no vision required.
 *
 *  peak          → notificationSuccess  ("you reached the top")
 *  valley        → notificationWarning  ("you're at a low point")
 *  zeroCrossing  → selection            (subtle tick — "crossed zero")
 */
export const FEATURE_PATTERNS = {
  peak:         'notificationSuccess',
  valley:       'notificationWarning',
  zeroCrossing: 'selection',
};

// ─── Playback Tuning ──────────────────────────────────────────────────────────

export const PLAYBACK = {
  /** Maximum points played per session (parser returns 201). */
  maxPoints: 201,

  /**
   * Extra pause (ms) inserted after a feature haptic fires.
   * Gives the user a moment to register the landmark before
   * normal point playback resumes.
   */
  featurePauseMs: 120,

  /**
   * x-distance tolerance for matching a point to a feature coordinate.
   * Keeps feature detection O(n) without requiring exact float equality.
   */
  featureMatchTolerance: 0.12,
};

// ─── Consolidated export ──────────────────────────────────────────────────────

const hapticsConfig = {
  slopeThresholds:     SLOPE_THRESHOLDS,
  curvatureThresholds: CURVATURE_THRESHOLDS,
  featurePatterns:     FEATURE_PATTERNS,
  delayMs:             DELAY_MS,
  playback:            PLAYBACK,
};

export default hapticsConfig;
