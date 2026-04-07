/**
 * interactionLogger.js
 *
 * Ring-buffer interaction log for the RLHF pipeline.
 *
 * Records every full interaction: the haptic context the model chose,
 * the user's subsequent guess, and the reward signal derived from it.
 * This log is the ground truth for offline analysis and future
 * supervised-learning iterations.
 *
 * Interaction shape:
 * {
 *   state:        { slope: string, curvature: string },   // discretized bucket names
 *   action:       { intensity: number, frequency: number, duration: number },
 *   userGuess:    string,      // equation the user typed
 *   trueFunction: string,      // actual equation that was played
 *   responseTime: number,      // ms from playback-done to feedback submission
 *   confidence:   number,      // 0–1 user-reported confidence
 *   reward:       number,      // 0–1 computed reward
 *   timestamp:    number,      // unix ms
 * }
 */

// ─── Constants ────────────────────────────────────────────────────────────────

const MAX_LOG_SIZE = 200;

// ─── Ring-buffer state ────────────────────────────────────────────────────────

let _buffer    = new Array(MAX_LOG_SIZE).fill(null);
let _writeHead = 0;
let _count     = 0;   // total ever written (monotone, not capped)

// ─── Singleton ────────────────────────────────────────────────────────────────

const interactionLogger = {

  /**
   * Append one completed interaction to the log.
   *
   * @param {{
   *   state:        { slope: string, curvature: string },
   *   action:       { intensity: number, frequency: number, duration: number },
   *   userGuess:    string,
   *   trueFunction: string,
   *   responseTime: number,
   *   confidence:   number,
   *   reward:       number,
   *   timestamp?:   number,
   * }} entry
   */
  logInteraction(entry) {
    if (!entry || typeof entry !== 'object') return;

    const record = {
      state: {
        slope:     entry.state?.slope     ?? 'unknown',
        curvature: entry.state?.curvature ?? 'unknown',
      },
      action: {
        intensity:  entry.action?.intensity  ?? 0,
        frequency:  entry.action?.frequency  ?? 0,
        duration:   entry.action?.duration   ?? 0,
      },
      userGuess:    String(entry.userGuess    ?? ''),
      trueFunction: String(entry.trueFunction ?? ''),
      responseTime: Number(entry.responseTime ?? 0),
      confidence:   Number(entry.confidence   ?? 0),
      reward:       Number(entry.reward       ?? 0),
      timestamp:    entry.timestamp ?? Date.now(),
    };

    _buffer[_writeHead] = record;
    _writeHead = (_writeHead + 1) % MAX_LOG_SIZE;
    _count++;
  },

  /**
   * Returns all stored interactions in chronological order.
   * @returns {Array<Object>}
   */
  getHistory() {
    const filled = Math.min(_count, MAX_LOG_SIZE);
    if (filled === 0) return [];

    const results = [];
    for (let i = 0; i < filled; i++) {
      const idx = (_writeHead - filled + i + MAX_LOG_SIZE) % MAX_LOG_SIZE;
      if (_buffer[idx] !== null) results.push(_buffer[idx]);
    }
    return results;
  },

  /**
   * Returns the last n interactions in chronological order.
   * @param {number} n
   * @returns {Array<Object>}
   */
  getRecent(n) {
    const filled = Math.min(_count, MAX_LOG_SIZE);
    const take   = Math.min(Math.max(0, n ?? 0), filled);
    if (take === 0) return [];

    const results = [];
    for (let i = 0; i < take; i++) {
      const idx = (_writeHead - take + i + MAX_LOG_SIZE) % MAX_LOG_SIZE;
      if (_buffer[idx] !== null) results.push(_buffer[idx]);
    }
    return results;
  },

  /**
   * Total number of interactions logged (including overwritten ones).
   * @returns {number}
   */
  totalCount() {
    return _count;
  },

  /**
   * Computes aggregate stats over all stored interactions.
   * Useful for a debug overlay or analytics screen.
   *
   * @returns {{
   *   totalSessions:  number,
   *   avgReward:      number,
   *   avgResponseMs:  number,
   *   accuracyRate:   number,   // fraction where reward >= 0.6
   * }}
   */
  getStats() {
    const history = this.getHistory();
    if (history.length === 0) {
      return { totalSessions: 0, avgReward: 0, avgResponseMs: 0, accuracyRate: 0 };
    }

    let rewardSum = 0;
    let responseSum = 0;
    let correctCount = 0;

    for (const entry of history) {
      rewardSum   += entry.reward;
      responseSum += entry.responseTime;
      if (entry.reward >= 0.6) correctCount++;
    }

    const n = history.length;
    return {
      totalSessions: n,
      avgReward:     rewardSum   / n,
      avgResponseMs: responseSum / n,
      accuracyRate:  correctCount / n,
    };
  },

  /**
   * Clears all stored interactions. Use between independent test sessions.
   */
  clear() {
    _buffer    = new Array(MAX_LOG_SIZE).fill(null);
    _writeHead = 0;
    _count     = 0;
  },
};

export default interactionLogger;
