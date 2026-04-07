/**
 * userModel.js
 *
 * Adaptive user model for the ML personalization pipeline.
 *
 * Role in pipeline:
 *   This module sits between interactionLogger (data collection) and
 *   adaptiveHaptics (decision point). It maintains two complementary
 *   adaptation mechanisms:
 *
 *   1. UCB1 multi-armed bandit — selects the optimal haptic intensity arm
 *      (light / medium / heavy) per slope bucket, learning which intensity
 *      level each user responds best to at different graph gradients.
 *
 *   2. EWMA delay multipliers — per curvature region, track whether the
 *      user is comfortable with the current pulse tempo and expand/contract
 *      delay accordingly based on pause / replay / complete signals.
 *
 * The confidence score gates adaptation: until MIN_SAMPLES haptic events
 * have been observed the system blends between baseline and adapted output
 * so that early cold-start noise doesn't degrade the experience.
 *
 * Exported singleton: userModel
 */

import { getSlopeBucket, getCurvatureRegion } from './interactionLogger';

// ─── Constants ────────────────────────────────────────────────────────────────

/** UCB1 exploration coefficient. Higher = more exploration. */
const UCB_C = 1.0;

/** Number of intensity arms: 0=impactLight, 1=impactMedium, 2=impactHeavy */
const NUM_ARMS = 3;

/** Number of slope buckets (must match interactionLogger). */
const NUM_BUCKETS = 5;

/** Number of curvature regions (must match interactionLogger). */
const NUM_REGIONS = 3;

/** EWMA learning rate for delay multipliers. */
const EWMA_ALPHA = 0.15;

/** Minimum delay multiplier (floor). */
const MULTIPLIER_MIN = 0.5;

/** Maximum delay multiplier (ceiling). */
const MULTIPLIER_MAX = 2.5;

/**
 * Number of haptic events required before confidence reaches 1.0.
 * Below this the output is blended between baseline and adapted.
 */
const MIN_SAMPLES = 80;

/** Human-readable arm labels for getOptimalIntensityType. */
const ARM_TO_TYPE = ['impactLight', 'impactMedium', 'impactHeavy'];

// ─── State Initialisation Helper ─────────────────────────────────────────────

/**
 * Creates a fresh copy of the internal model state with Laplace-smoothed priors.
 * @returns {Object}
 */
function createInitialState() {
  // counts[b][a] = 1  (Laplace smoothing — avoids ln(0) and divide-by-zero)
  const counts = Array.from({ length: NUM_BUCKETS }, () =>
    new Array(NUM_ARMS).fill(1),
  );

  // rewards[b][a] = 0.33  (uniform prior, Q(b,a) ≈ 0.33 for all arms initially)
  const rewards = Array.from({ length: NUM_BUCKETS }, () =>
    new Array(NUM_ARMS).fill(0.33),
  );

  return {
    bandits: { counts, rewards },
    delayMultipliers:  new Array(NUM_REGIONS).fill(1.0),
    totalHapticEvents: 0,
    totalSessions:     0,
    lastUpdatedAt:     Date.now(),
  };
}

// ─── Module-Level Mutable State ───────────────────────────────────────────────

let _state = createInitialState();

/**
 * lastSelectedArm[bucket] — the arm index chosen by selectArm() the last time
 * that bucket was queried. Initialised to the neutral middle arm.
 * @type {number[]}
 */
let _lastSelectedArm = new Array(NUM_BUCKETS).fill(1);

// ─── UCB1 Internals ───────────────────────────────────────────────────────────

/**
 * Computes total pulls for a bucket (denominator inside the ln term).
 * Because counts are initialised to 1 this is always >= NUM_ARMS.
 * @param {number} bucket
 * @returns {number}
 */
function totalPulls(bucket) {
  return _state.bandits.counts[bucket].reduce((s, c) => s + c, 0);
}

/**
 * Selects the arm with the highest UCB1 score for the given slope bucket.
 * UCB(b,a) = Q(b,a) + C * sqrt(ln(N_b) / n_{b,a})
 * where Q(b,a) = rewards[b][a] / counts[b][a]
 *
 * @param {number} bucket  Integer 0–4.
 * @returns {0|1|2}  Selected arm index.
 */
function selectArm(bucket) {
  const { counts, rewards } = _state.bandits;
  const n = totalPulls(bucket);
  const lnN = Math.log(Math.max(n, 1)); // guard against n=0 (shouldn't happen)

  let bestArm   = 0;
  let bestScore = -Infinity;

  for (let a = 0; a < NUM_ARMS; a++) {
    const q   = rewards[bucket][a] / counts[bucket][a];
    const ucb = q + UCB_C * Math.sqrt(lnN / counts[bucket][a]);
    if (ucb > bestScore) {
      bestScore = ucb;
      bestArm   = a;
    }
  }

  _lastSelectedArm[bucket] = bestArm;
  return bestArm;
}

/**
 * Applies a reward signal to the currently selected arm for a bucket.
 * @param {number} bucket
 * @param {number} reward  Value in [0, 1].
 */
function applyReward(bucket, reward) {
  const arm = _lastSelectedArm[bucket];
  _state.bandits.rewards[bucket][arm] += reward;
  // counts were already incremented in updateFromBatch; no double-count here.
}

// ─── Delay Multiplier Internals ───────────────────────────────────────────────

/**
 * Updates delay multiplier for a curvature region using a multiplicative
 * factor, then clamps to [MULTIPLIER_MIN, MULTIPLIER_MAX].
 * @param {number} region    Integer 0–2.
 * @param {number} factor    Multiplicative adjustment (e.g. 1.2 to slow down).
 */
function adjustMultiplier(region, factor) {
  const current = _state.delayMultipliers[region];
  const updated  = current * factor;
  _state.delayMultipliers[region] = Math.min(
    MULTIPLIER_MAX,
    Math.max(MULTIPLIER_MIN, updated),
  );
}

// ─── Singleton Object ─────────────────────────────────────────────────────────

const userModel = {
  // ── Batch Update ────────────────────────────────────────────────────────────

  /**
   * Ingests a batch of haptic log entries from interactionLogger and increments
   * bandit pull counts for each event's slope bucket.
   *
   * Note: rewards are NOT applied here. Rewards come from subsequent playback
   * events (pause / replay / complete) via updateFromPlaybackEvent().
   *
   * @param {Array<{slope: number, curvature: number}>} events
   */
  updateFromBatch(events) {
    if (!Array.isArray(events) || events.length === 0) return;

    for (const ev of events) {
      if (!ev || typeof ev !== 'object') continue;
      const bucket = getSlopeBucket(ev.slope ?? 0);
      const arm    = selectArm(bucket); // also records in _lastSelectedArm
      _state.bandits.counts[bucket][arm]++;
      _state.totalHapticEvents++;
    }

    _state.lastUpdatedAt = Date.now();
  },

  // ── Playback Event Update ────────────────────────────────────────────────────

  /**
   * Updates bandit rewards and delay multipliers based on a playback control
   * event that followed a sequence of haptic events.
   *
   * Reward rules:
   *   'pause'    → reward 0.1 (mild positive — user stopped to absorb)
   *                delay multipliers for curvature regions present *= 1.2
   *   'replay'   → reward 0.0 (negative signal — user needed to re-listen)
   *                delay multipliers for all regions present *= 1.3
   *   'complete' → reward 1.0 (strong positive — session finished cleanly)
   *                delay multipliers for all regions present *= 0.95
   *                totalSessions incremented
   *   'stop'     → no model update
   *
   * @param {'pause'|'stop'|'replay'|'complete'} type
   * @param {number}        pointIndex    Cursor position when event fired.
   * @param {Array<Object>} recentEvents  Last ~20 haptic log entries from the logger.
   */
  updateFromPlaybackEvent(type, pointIndex, recentEvents) {
    if (!type) return;

    const events = Array.isArray(recentEvents)
      ? recentEvents.slice(-20)
      : [];

    if (type === 'stop') return; // no-op

    // Collect unique buckets and regions present in the recent window.
    const bucketsPresent  = new Set();
    const regionsPresent  = new Set();

    for (const ev of events) {
      if (!ev || typeof ev !== 'object') continue;
      bucketsPresent.add(getSlopeBucket(ev.slope     ?? 0));
      regionsPresent.add(getCurvatureRegion(ev.curvature ?? 0));
    }

    if (type === 'pause') {
      for (const b of bucketsPresent) applyReward(b, 0.1);
      for (const r of regionsPresent) adjustMultiplier(r, 1.2);
    } else if (type === 'replay') {
      for (const b of bucketsPresent) applyReward(b, 0.0);
      for (const r of regionsPresent) adjustMultiplier(r, 1.3);
    } else if (type === 'complete') {
      for (const b of bucketsPresent) applyReward(b, 1.0);
      for (const r of regionsPresent) adjustMultiplier(r, 0.95);
      _state.totalSessions++;
    }

    _state.lastUpdatedAt = Date.now();
  },

  // ── Query ────────────────────────────────────────────────────────────────────

  /**
   * Returns the UCB1-optimal arm index (0/1/2) for a given slope magnitude.
   * Side-effect: records the chosen arm in _lastSelectedArm for the bucket.
   *
   * @param {number} slopeMagnitude  Absolute value of dy.
   * @returns {0|1|2}
   */
  getOptimalIntensityArm(slopeMagnitude) {
    const bucket = getSlopeBucket(slopeMagnitude ?? 0);
    return selectArm(bucket);
  },

  /**
   * Returns the haptic type string corresponding to the UCB1-optimal arm for
   * the given slope magnitude.
   *
   * @param {number} slopeMagnitude  Absolute value of dy.
   * @returns {'impactLight'|'impactMedium'|'impactHeavy'}
   */
  getOptimalIntensityType(slopeMagnitude) {
    const arm = this.getOptimalIntensityArm(slopeMagnitude);
    return ARM_TO_TYPE[arm] ?? 'impactMedium';
  },

  /**
   * Returns the learned delay multiplier for a given curvature magnitude.
   *
   * @param {number} curvatureMagnitude  Absolute value of d2y.
   * @returns {number}  Value in [MULTIPLIER_MIN, MULTIPLIER_MAX].
   */
  getDelayMultiplier(curvatureMagnitude) {
    const region = getCurvatureRegion(curvatureMagnitude ?? 0);
    return _state.delayMultipliers[region];
  },

  /**
   * Returns a confidence score in [0, 1] representing how much data the model
   * has seen relative to the minimum reliable sample size.
   *
   * At 0 the output of adaptiveHaptics falls back to pure baseline.
   * At 1 the model output is used at full weight.
   *
   * @returns {number}
   */
  getConfidence() {
    return Math.min(1.0, _state.totalHapticEvents / MIN_SAMPLES);
  },

  /**
   * Returns a plain-object snapshot of all internal state for debugging
   * or display in a developer overlay. The returned object is a deep copy
   * so mutations do not affect the model.
   *
   * @returns {Object}
   */
  getSnapshot() {
    return {
      bandits: {
        counts:  _state.bandits.counts.map((row) => row.slice()),
        rewards: _state.bandits.rewards.map((row) => row.slice()),
      },
      delayMultipliers:  _state.delayMultipliers.slice(),
      totalHapticEvents: _state.totalHapticEvents,
      totalSessions:     _state.totalSessions,
      lastUpdatedAt:     _state.lastUpdatedAt,
      lastSelectedArm:   _lastSelectedArm.slice(),
      confidence:        this.getConfidence(),
    };
  },

  // ── Explicit Feedback ────────────────────────────────────────────────────────

  /**
   * Applies a direct user feedback signal to the model.
   * This is the primary learning driver — much stronger than inferred signals.
   *
   * 'tooFast'    → all delay multipliers × 1.3  (slow everything down)
   * 'tooSlow'    → all delay multipliers × 0.75 (speed everything up)
   * 'tooIntense' → reward light arm (+1.0), penalise heavy arm (0 reward + pull)
   *                across all slope buckets
   * 'tooWeak'    → reward heavy arm (+1.0), penalise light arm (0 reward + pull)
   *                across all slope buckets
   *
   * @param {'tooFast'|'tooSlow'|'tooIntense'|'tooWeak'} type
   */
  applyExplicitFeedback(type) {
    if (!type) return;

    if (type === 'tooFast') {
      for (let r = 0; r < NUM_REGIONS; r++) adjustMultiplier(r, 1.3);

    } else if (type === 'tooSlow') {
      for (let r = 0; r < NUM_REGIONS; r++) adjustMultiplier(r, 0.75);

    } else if (type === 'tooIntense') {
      // Reward light arm, penalise heavy arm across every slope bucket
      for (let b = 0; b < NUM_BUCKETS; b++) {
        _state.bandits.rewards[b][0] += 1.0;  // light  — reward
        _state.bandits.counts[b][0]++;
        _state.bandits.counts[b][2]++;         // heavy  — pull with no reward
        _state.totalHapticEvents++;
      }

    } else if (type === 'tooWeak') {
      // Reward heavy arm, penalise light arm across every slope bucket
      for (let b = 0; b < NUM_BUCKETS; b++) {
        _state.bandits.rewards[b][2] += 1.0;  // heavy  — reward
        _state.bandits.counts[b][2]++;
        _state.bandits.counts[b][0]++;         // light  — pull with no reward
        _state.totalHapticEvents++;
      }
    }

    _state.lastUpdatedAt = Date.now();
  },

  /**
   * Resets the model to its initial prior state.
   * Call this when starting a completely new user profile or in tests.
   */
  reset() {
    _state           = createInitialState();
    _lastSelectedArm = new Array(NUM_BUCKETS).fill(1);
  },
};

export default userModel;
