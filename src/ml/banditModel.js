/**
 * banditModel.js
 *
 * Contextual bandit model — the core ML engine.
 *
 * Architecture:
 *   State  = discretized [slope bucket, curvature bucket]  (9 possible states)
 *   Action = one of 3 discrete haptic configurations
 *   Q[state][action] = estimated expected reward for that (state, action) pair
 *
 * Algorithm: epsilon-greedy Q-learning
 *   - With probability epsilon: explore (pick a random action)
 *   - Otherwise: exploit (pick the action with the highest Q-value)
 *   - On feedback: Q[s][a] += alpha * (reward - Q[s][a])   (temporal difference update)
 *
 * Q-values are initialised to 0.5 (optimistic prior — encourages early exploration).
 *
 * Action definitions:
 *   Each action maps directly to a haptic configuration:
 *     intensity → haptic impact weight (light/medium/heavy)
 *     frequency → pulse rate (Hz) — higher = shorter inter-pulse delay
 *     duration  → nominal pulse duration (ms) — for logging/display only
 */

// ─── Hyperparameters ──────────────────────────────────────────────────────────

/** Q-learning rate. Controls how fast new rewards override old estimates. */
const ALPHA = 0.1;

/**
 * Exploration rate. Fraction of steps where a random action is chosen.
 * 0.2 = 20% exploration, 80% exploitation.
 */
const EPSILON = 0.2;

/** Initial Q-value for all (state, action) pairs. */
const Q_INIT = 0.5;

// ─── Action space ─────────────────────────────────────────────────────────────

/**
 * The three discrete haptic actions the bandit can select.
 *
 * hapticType maps to react-native-haptic-feedback trigger names.
 * delay (ms) is derived from frequency: delay ≈ 1000 / frequency.
 * duration is a descriptive value for logging — it does not control vibration length
 * directly (that is determined by the device haptic engine).
 */
export const ACTIONS = [
  { intensity: 0.5, frequency: 100, hapticType: 'impactLight',  delay: 160, duration: 40  },
  { intensity: 1.0, frequency: 150, hapticType: 'impactMedium', delay: 90,  duration: 80  },
  { intensity: 1.5, frequency: 200, hapticType: 'impactHeavy',  delay: 35,  duration: 120 },
];

export const NUM_ACTIONS = ACTIONS.length;

// ─── Q-table helpers ──────────────────────────────────────────────────────────

/**
 * Module-level Q-table: Map<stateKey → [q0, q1, q2]>
 * Initialised lazily — states are added the first time they are queried.
 */
const _Q = new Map();

/**
 * Returns (and lazily initialises) the Q-value array for a state.
 * @param {string} stateKey
 * @returns {number[]} Mutable array of length NUM_ACTIONS.
 */
function getQRow(stateKey) {
  if (!_Q.has(stateKey)) {
    _Q.set(stateKey, new Array(NUM_ACTIONS).fill(Q_INIT));
  }
  return _Q.get(stateKey);
}

/**
 * Returns the index of the maximum value in an array.
 * Ties are broken by picking the lowest index.
 * @param {number[]} arr
 * @returns {number}
 */
function argmax(arr) {
  let best = 0;
  for (let i = 1; i < arr.length; i++) {
    if (arr[i] > arr[best]) best = i;
  }
  return best;
}

// ─── Singleton ────────────────────────────────────────────────────────────────

const banditModel = {

  /**
   * Selects an action for the given state using epsilon-greedy policy.
   *
   * - With probability EPSILON: returns a uniformly random action index.
   * - Otherwise: returns the action with the highest Q-value (greedy exploit).
   *
   * @param {string} stateKey  Discretized state identifier (e.g. "medium_flat").
   * @returns {0|1|2}          Selected action index.
   */
  selectAction(stateKey) {
    if (Math.random() < EPSILON) {
      // Explore: pick a random action
      return Math.floor(Math.random() * NUM_ACTIONS);
    }
    // Exploit: pick the greedy best
    return argmax(getQRow(stateKey));
  },

  /**
   * Updates the Q-value for a (state, action) pair using the TD(0) update rule:
   *
   *   Q[s][a] ← Q[s][a] + α × (reward − Q[s][a])
   *
   * This is a one-step temporal difference update (no next-state bootstrap
   * needed because this is a bandit, not a sequential MDP).
   *
   * @param {string} stateKey   State the action was taken in.
   * @param {0|1|2}  actionIdx  Action that was selected.
   * @param {number} reward     Observed reward in [0, 1].
   */
  update(stateKey, actionIdx, reward) {
    if (actionIdx < 0 || actionIdx >= NUM_ACTIONS) return;
    const q = getQRow(stateKey);
    q[actionIdx] = q[actionIdx] + ALPHA * (reward - q[actionIdx]);
  },

  /**
   * Returns the current Q-values for a state (read-only copy).
   * Useful for debug overlays.
   *
   * @param {string} stateKey
   * @returns {number[]}
   */
  getQValues(stateKey) {
    return getQRow(stateKey).slice();
  },

  /**
   * Returns a snapshot of all learned Q-values and model metadata.
   * Safe to JSON.stringify for logging.
   *
   * @returns {{
   *   alpha:    number,
   *   epsilon:  number,
   *   qInit:    number,
   *   states:   Object,   // stateKey → q-values
   * }}
   */
  getSnapshot() {
    const states = {};
    for (const [key, qRow] of _Q.entries()) {
      states[key] = qRow.slice();
    }
    return { alpha: ALPHA, epsilon: EPSILON, qInit: Q_INIT, states };
  },

  /**
   * Resets all Q-values to the initial prior.
   * Call this to start fresh (e.g. new user, A/B test reset).
   */
  reset() {
    _Q.clear();
  },
};

export default banditModel;
