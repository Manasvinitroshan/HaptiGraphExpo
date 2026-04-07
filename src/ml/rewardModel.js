/**
 * rewardModel.js
 *
 * Pure reward computation for the RLHF pipeline.
 *
 * Converts the outcome of one learning session into a scalar reward in [0, 1]
 * that the bandit model uses to update its Q-values.
 *
 * Reward breakdown:
 *
 *   correctness      (0.0 – 0.8)   — did the user identify the right function class?
 *   timePenalty      (0.0 – -0.15) — penalty for slow response (> 5 seconds)
 *   confidenceBoost  (-0.1 – +0.2) — correct + confident → bonus; wrong + confident → penalty
 *
 *   reward = clamp(correctness + timePenalty + confidenceBoost, 0, 1)
 *
 * Function classes (for coarse matching):
 *   'sinusoidal' | 'exponential' | 'cubic' | 'quadratic' | 'linear' | 'constant'
 *
 * Superclass groupings (for partial credit):
 *   polynomial: quadratic, cubic, linear, constant
 *   oscillating: sinusoidal
 *   growth: exponential
 */

// ─── Function class classifier ────────────────────────────────────────────────

/**
 * Classifies an equation string into a coarse function family.
 * Operates on the raw string the user typed — tolerant of spacing/case.
 *
 * @param {string} eq
 * @returns {'sinusoidal'|'exponential'|'cubic'|'quadratic'|'linear'|'constant'}
 */
export function classifyFunction(eq) {
  if (!eq || typeof eq !== 'string') return 'constant';

  const s = eq.toLowerCase().replace(/\s+/g, '');

  // Sinusoidal — any trig function
  if (/sin|cos|tan|sinh|cosh/.test(s)) return 'sinusoidal';

  // Exponential — e^x, exp(x), a^x
  if (/exp\(|e\^|[0-9]+\^x/.test(s)) return 'exponential';

  // Cubic / high-degree polynomial — x^3 and above
  // Also catches x^4, x^5, etc. → lumped into 'cubic' class
  if (/x\^[3-9]|x\*\*[3-9]|x\^[1-9][0-9]/.test(s)) return 'cubic';

  // Quadratic — x^2
  if (/x\^2|x\*\*2|x\*x/.test(s)) return 'quadratic';

  // Linear — any remaining expression containing x
  if (/x/.test(s)) return 'linear';

  // No variable — constant
  return 'constant';
}

// ─── Superclass grouping ──────────────────────────────────────────────────────

const SUPERCLASS = {
  linear:      'polynomial',
  quadratic:   'polynomial',
  cubic:       'polynomial',
  constant:    'polynomial',
  sinusoidal:  'oscillating',
  exponential: 'growth',
};

function getSuperclass(cls) {
  return SUPERCLASS[cls] ?? 'other';
}

// ─── Time penalty helper ──────────────────────────────────────────────────────

/**
 * Returns a penalty in [-0.15, 0] based on response time.
 *   < 5 000 ms  → no penalty
 *   5–15 000 ms → linear ramp from 0 to -0.15
 *   > 15 000 ms → capped at -0.15
 *
 * @param {number} ms
 * @returns {number}
 */
function timePenalty(ms) {
  if (ms <= 5_000)  return 0;
  if (ms >= 15_000) return -0.15;
  return -0.15 * ((ms - 5_000) / 10_000);
}

// ─── Core reward function ─────────────────────────────────────────────────────

/**
 * Computes a normalized reward signal for one completed session.
 *
 * @param {{
 *   trueFunction: string,   // equation that was played
 *   userGuess:    string,   // equation the user typed
 *   responseTime: number,   // ms from playback-done to submission
 *   confidence:   number,   // 0–1 (0=uncertain, 1=very confident)
 * }} params
 *
 * @returns {{
 *   reward:      number,   // final scalar in [0, 1]
 *   breakdown: {
 *     correctness:      number,
 *     timePenalty:      number,
 *     confidenceBoost:  number,
 *     trueClass:        string,
 *     guessClass:       string,
 *     isExact:          boolean,
 *     isSameClass:      boolean,
 *     isSameSuperclass: boolean,
 *   },
 * }}
 */
export function computeReward({ trueFunction, userGuess, responseTime, confidence }) {
  const trueClass  = classifyFunction(trueFunction ?? '');
  const guessClass = classifyFunction(userGuess    ?? '');
  const conf       = Math.min(1, Math.max(0, confidence ?? 0));
  const respMs     = Math.max(0, responseTime ?? 0);

  const isExact          = trueClass === guessClass;
  const isSameSuperclass = getSuperclass(trueClass) === getSuperclass(guessClass);

  // ── Correctness ─────────────────────────────────────────────────────────────
  let correctness;
  if (isExact) {
    correctness = 0.8;
  } else if (isSameSuperclass) {
    // Partial credit: e.g. guessed quadratic but was cubic
    correctness = 0.4;
  } else {
    correctness = 0.0;
  }

  // ── Time penalty ─────────────────────────────────────────────────────────────
  const tp = timePenalty(respMs);

  // ── Confidence boost / penalty ────────────────────────────────────────────────
  let confidenceBoost = 0;
  if (isExact && conf >= 0.7) {
    // Correct and confident → strong positive signal
    confidenceBoost = 0.2;
  } else if (!isExact && conf >= 0.7) {
    // Overconfident and wrong → mild penalty
    confidenceBoost = -0.1;
  }

  // ── Final reward ──────────────────────────────────────────────────────────────
  const raw    = correctness + tp + confidenceBoost;
  const reward = Math.min(1, Math.max(0, raw));

  return {
    reward,
    breakdown: {
      correctness,
      timePenalty:      tp,
      confidenceBoost,
      trueClass,
      guessClass,
      isExact,
      isSameClass:      isExact,
      isSameSuperclass,
    },
  };
}
