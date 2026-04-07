/**
 * adaptiveEngine.js
 *
 * Decision layer — bridges graph data and the bandit model.
 *
 * Two responsibilities:
 *
 *   1. STATE DISCRETIZATION
 *      Converts continuous slope / curvature values into a compact state key
 *      the bandit can use as a Q-table row index. Reduces the infinite
 *      continuous state space to 9 discrete buckets (3 slope × 3 curvature).
 *
 *   2. ACTION → HAPTIC TRANSLATION
 *      Maps the bandit's chosen action index to a concrete haptic event
 *      ({type, delay}) that the playback loop can fire directly.
 *      Feature landmarks (peaks / valleys / zero crossings) always use their
 *      semantic pattern — the bandit controls the baseline intensity between
 *      landmarks, not the landmarks themselves.
 *
 * Both functions are pure — no mutable state here. All state lives in
 * banditModel.js (Q-table) and interactionLogger.js (ring buffer).
 */

import { FEATURE_PATTERNS, PLAYBACK } from '../constants/hapticsConfig';
import { ACTIONS } from './banditModel';

// ─── State discretization ─────────────────────────────────────────────────────

/**
 * Slope bucket thresholds (absolute value of dy).
 *   low:    |dy| < 2    — nearly horizontal
 *   medium: |dy| < 6    — noticeable incline
 *   high:   |dy| ≥ 6   — steep
 */
const SLOPE_THRESHOLDS = [2, 6];
const SLOPE_LABELS     = ['low', 'medium', 'high'];

/**
 * Curvature bucket thresholds (absolute value of d2y).
 *   flat:     |d2y| < 1  — straight or very gentle bend
 *   moderate: |d2y| < 5  — noticeable curve
 *   sharp:    |d2y| ≥ 5 — tight turn
 */
const CURVATURE_THRESHOLDS = [1, 5];
const CURVATURE_LABELS     = ['flat', 'moderate', 'sharp'];

/**
 * Maps a slope magnitude to a bucket index (0, 1, or 2).
 * @param {number} dy  Raw slope value (sign ignored).
 * @returns {0|1|2}
 */
function slopeBucketIndex(dy) {
  const abs = Math.abs(dy ?? 0);
  for (let i = 0; i < SLOPE_THRESHOLDS.length; i++) {
    if (abs < SLOPE_THRESHOLDS[i]) return i;
  }
  return 2;
}

/**
 * Maps a curvature magnitude to a bucket index (0, 1, or 2).
 * @param {number} d2y  Raw curvature value (sign ignored).
 * @returns {0|1|2}
 */
function curvatureBucketIndex(d2y) {
  const abs = Math.abs(d2y ?? 0);
  for (let i = 0; i < CURVATURE_THRESHOLDS.length; i++) {
    if (abs < CURVATURE_THRESHOLDS[i]) return i;
  }
  return 2;
}

/**
 * Converts continuous slope + curvature into a discrete state descriptor.
 *
 * @param {number} slope     dy at this graph point.
 * @param {number} curvature d2y at this graph point.
 * @returns {{
 *   slopeBucket:     string,  // 'low' | 'medium' | 'high'
 *   curvatureBucket: string,  // 'flat' | 'moderate' | 'sharp'
 *   stateKey:        string,  // e.g. 'medium_flat' — Q-table row key
 * }}
 */
export function discretizeState(slope, curvature) {
  const si = slopeBucketIndex(slope);
  const ci = curvatureBucketIndex(curvature);
  return {
    slopeBucket:     SLOPE_LABELS[si],
    curvatureBucket: CURVATURE_LABELS[ci],
    stateKey:        `${SLOPE_LABELS[si]}_${CURVATURE_LABELS[ci]}`,
  };
}

// ─── Adaptive haptic selection ────────────────────────────────────────────────

/**
 * Selects the adaptive haptic event for one graph point.
 *
 * Steps:
 *   1. Discretize slope + curvature → stateKey
 *   2. Ask bandit to select an action (epsilon-greedy)
 *   3. Map action → haptic type + delay
 *   4. If the point is a feature landmark, override type with semantic pattern
 *      (peaks / valleys / zero crossings carry fixed perceptual meaning)
 *
 * @param {{
 *   slope:     number,
 *   curvature: number,
 *   feature?:  'peak' | 'valley' | 'zeroCrossing' | undefined,
 * }} point
 * @param {Object} bandit  banditModel singleton (or compatible interface).
 *
 * @returns {{
 *   type:      string,            // haptic trigger name
 *   delay:     number,            // ms to wait after firing
 *   feature:   string|undefined,  // feature key if landmark
 *   actionIdx: 0|1|2,             // which bandit arm was chosen
 *   stateKey:  string,            // discretized state used
 *   action:    Object,            // full ACTIONS[actionIdx] descriptor
 * }}
 */
export function getAdaptiveHaptic(point, bandit) {
  // ── Fallback for bad input ────────────────────────────────────────────────
  if (!point || typeof point !== 'object') {
    return {
      type:      'impactLight',
      delay:     160,
      feature:   undefined,
      actionIdx: 0,
      stateKey:  'low_flat',
      action:    ACTIONS[0],
    };
  }

  const slope     = point.slope     ?? 0;
  const curvature = point.curvature ?? 0;
  const feature   = point.feature;

  // ── Step 1: Discretize state ──────────────────────────────────────────────
  const { stateKey } = discretizeState(slope, curvature);

  // ── Step 2: Bandit selects action ─────────────────────────────────────────
  const actionIdx = bandit.selectAction(stateKey);
  const action    = ACTIONS[actionIdx] ?? ACTIONS[0];

  // ── Step 3: Derive haptic type and delay from action ──────────────────────
  let hapticType = action.hapticType;
  let delay      = action.delay;

  // ── Step 4: Feature landmark override ────────────────────────────────────
  // Semantic patterns (peak / valley / zero) are never overridden by the model.
  // The model influences baseline pulses between landmarks only.
  if (feature && FEATURE_PATTERNS[feature]) {
    hapticType = FEATURE_PATTERNS[feature];
    delay     += PLAYBACK.featurePauseMs;   // extra pause after landmark
  }

  return {
    type:      hapticType,
    delay,
    feature,
    actionIdx,
    stateKey,
    action,
  };
}

/**
 * Applies a reward to a (state, action) pair via the bandit update rule.
 * Thin wrapper so callers don't need to import banditModel directly.
 *
 * @param {string}  stateKey   State key from discretizeState().
 * @param {0|1|2}   actionIdx  Action index from getAdaptiveHaptic().
 * @param {number}  reward     Scalar in [0, 1].
 * @param {Object}  bandit     banditModel singleton.
 */
export function updateModel(stateKey, actionIdx, reward, bandit) {
  bandit.update(stateKey, actionIdx, reward);
}
