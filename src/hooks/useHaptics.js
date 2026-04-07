/**
 * useHaptics.js
 *
 * React hook that manages the full haptic playback lifecycle.
 *
 * Exposes:
 *   startHaptics(graphData)  — begin playback
 *   stopHaptics()            — cancel immediately
 *   pauseHaptics()           — pause at current position
 *   resumeHaptics()          — resume from pause
 *
 * State:
 *   isPlaying   boolean
 *   isPaused    boolean
 *   progress    0–1  (fraction of points played)
 *   status      'idle' | 'playing' | 'paused' | 'stopped' | 'done'
 *
 * ML integration:
 *   Each point in the loop is routed through getAdaptiveHaptic() which blends
 *   the static rule-based baseline with the live user model (UCB1 bandit +
 *   EWMA delay multipliers). Events are logged to interactionLogger and the
 *   user model is updated in batches every BATCH_UPDATE_INTERVAL events.
 *   Playback control actions (pause / stop / complete) trigger model reward
 *   updates so the system learns from session-level feedback.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { getAdaptiveHaptic } from '../ml/adaptiveHaptics';
import interactionLogger from '../ml/interactionLogger';
import userModel from '../ml/userModel';
import { buildHapticSequence, playHapticEvent } from '../utils/hapticEngine';

// ─── Constants ────────────────────────────────────────────────────────────────

/** Number of haptic events between incremental user-model updates. */
const BATCH_UPDATE_INTERVAL = 15;

// ─── Hook ─────────────────────────────────────────────────────────────────────

export default function useHaptics() {
  const [isPlaying,     setIsPlaying]     = useState(false);
  const [isPaused,      setIsPaused]      = useState(false);
  const [progress,      setProgress]      = useState(0);
  const [status,        setStatus]        = useState('idle');
  const [currentIndex,  setCurrentIndex]  = useState(-1);

  // ── Playback control refs ────────────────────────────────────────────────────
  // Mutable refs — safe to read/write inside async loops without stale closures
  const cancelledRef  = useRef(false);  // stop signal
  const pausedRef     = useRef(false);  // pause signal
  const sequenceRef   = useRef([]);     // current haptic event list
  const indexRef      = useRef(0);      // current playback position
  const totalRef      = useRef(0);      // total events in sequence

  // ── ML tracking refs ─────────────────────────────────────────────────────────
  const batchCountRef         = useRef(0);          // events since last batch update
  const lastBatchTimestampRef = useRef(Date.now()); // timestamp of last batch read

  // ── Helpers ──────────────────────────────────────────────────────────────────

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  /**
   * Polls until the pause flag is cleared or playback is cancelled.
   * Checks every 50ms — cheap and responsive.
   */
  const waitWhilePaused = useCallback(async () => {
    while (pausedRef.current && !cancelledRef.current) {
      await sleep(50);
    }
  }, []);

  // ── Core playback loop ───────────────────────────────────────────────────────

  /**
   * Runs the haptic sequence asynchronously from a given start index.
   *
   * Per-point: calls getAdaptiveHaptic() to blend the static baseline with the
   * live user model, logs the result to interactionLogger, fires the haptic, and
   * batch-updates userModel every BATCH_UPDATE_INTERVAL events.
   *
   * Reads cancelledRef / pausedRef on every iteration so stop/pause are
   * responsive without any race conditions.
   */
  const runLoop = useCallback(async (sequence, startIndex = 0) => {
    const total = sequence.length;

    for (let i = startIndex; i < total; i++) {
      // ── Stop signal ─────────────────────────────────────────────────────────
      if (cancelledRef.current) break;

      // ── Pause signal ────────────────────────────────────────────────────────
      if (pausedRef.current) {
        indexRef.current = i;   // save position before suspending
        await waitWhilePaused();
        if (cancelledRef.current) break;
      }

      const event = sequence[i];

      // ── Adaptive haptic decision ─────────────────────────────────────────────
      // getAdaptiveHaptic blends the static baseline with the learned user model.
      // Feature haptics (peak/valley/zero) are never overridden by the model —
      // they carry semantic meaning the user has already learned.
      const adaptiveEvent = getAdaptiveHaptic(
        {
          x:         event.x         ?? 0,
          y:         event.y         ?? 0,
          slope:     event.slope     ?? 0,
          curvature: event.curvature ?? 0,
        },
        event.feature,
      );

      // ── Fire haptic ──────────────────────────────────────────────────────────
      playHapticEvent(adaptiveEvent);

      // ── Log to interaction logger ────────────────────────────────────────────
      interactionLogger.logHapticEvent({
        pointIndex: i,
        x:          event.x         ?? 0,
        y:          event.y         ?? 0,
        slope:      event.slope     ?? 0,
        curvature:  event.curvature ?? 0,
        hapticType: adaptiveEvent.type,
        featureKey: adaptiveEvent.feature,
        timestamp:  Date.now(),
      });

      // ── Batch update user model every N events ────────────────────────────────
      batchCountRef.current++;
      if (batchCountRef.current >= BATCH_UPDATE_INTERVAL) {
        batchCountRef.current = 0;
        const batch = interactionLogger.getBatchSince(lastBatchTimestampRef.current);
        lastBatchTimestampRef.current = Date.now();
        // Non-blocking — userModel.updateFromBatch is synchronous but fast
        userModel.updateFromBatch(batch);
      }

      // ── Update progress + tracking index ─────────────────────────────────────
      indexRef.current = i;
      setCurrentIndex(i);
      setProgress((i + 1) / total);

      // ── Delay before next pulse ───────────────────────────────────────────────
      // Use adaptive delay (model may have shortened/extended it vs baseline).
      if (i < total - 1) {
        await sleep(adaptiveEvent.delay);
      }
    }

    // ── Finalise state (only if not cancelled mid-loop) ──────────────────────
    if (!cancelledRef.current) {
      // Reward signal: session completed cleanly → strong positive feedback
      interactionLogger.logPlaybackEvent('complete', totalRef.current - 1);
      userModel.updateFromPlaybackEvent(
        'complete',
        totalRef.current - 1,
        interactionLogger.getRecentEvents(20),
      );

      setStatus('done');
      setIsPlaying(false);
      setIsPaused(false);
      setProgress(1);
      setCurrentIndex(-1);
    }
  }, [waitWhilePaused]);

  // ── Public API ───────────────────────────────────────────────────────────────

  /**
   * Begin haptic playback for the given graph data.
   * Silently no-ops if already playing; call stopHaptics() first to restart.
   *
   * @param {{ points, slope, curvature, features }} graphData
   */
  const startHaptics = useCallback((graphData) => {
    if (isPlaying) return;
    if (!graphData?.points?.length) {
      setStatus('idle');
      return;
    }

    // Build the semantic haptic sequence from graph data (compiled once).
    // Each event now includes {x, y, slope, curvature} for the adaptive layer.
    const sequence = buildHapticSequence(graphData);
    if (!sequence.length) {
      setStatus('idle');
      return;
    }

    // Reset all control refs
    cancelledRef.current = false;
    pausedRef.current    = false;
    indexRef.current     = 0;
    totalRef.current     = sequence.length;
    sequenceRef.current  = sequence;

    // Reset ML batch tracking refs
    batchCountRef.current         = 0;
    lastBatchTimestampRef.current = Date.now();

    setProgress(0);
    setIsPlaying(true);
    setIsPaused(false);
    setStatus('playing');

    // Log start event
    interactionLogger.logPlaybackEvent('play', 0);

    // Kick off loop — fire and forget (state is managed inside runLoop)
    runLoop(sequence, 0);
  }, [isPlaying, runLoop]);

  /**
   * Immediately cancel ongoing playback.
   * Resets progress and status to stopped.
   */
  const stopHaptics = useCallback(() => {
    // Log stop event before cancelling (indexRef still holds last position)
    interactionLogger.logPlaybackEvent('stop', indexRef.current);

    cancelledRef.current = true;
    pausedRef.current    = false;
    setIsPlaying(false);
    setIsPaused(false);
    setProgress(0);
    setCurrentIndex(-1);
    setStatus('stopped');
  }, []);

  /**
   * Suspend playback at the current point.
   * Call resumeHaptics() to continue from where it left off.
   *
   * Sends a 'pause' reward to the user model: mild positive signal (user stopped
   * to absorb, may want slower pacing).
   */
  const pauseHaptics = useCallback(() => {
    if (!isPlaying || isPaused) return;
    pausedRef.current = true;
    setIsPaused(true);
    setStatus('paused');

    // Log pause + apply model reward
    interactionLogger.logPlaybackEvent('pause', indexRef.current);
    userModel.updateFromPlaybackEvent(
      'pause',
      indexRef.current,
      interactionLogger.getRecentEvents(20),
    );
  }, [isPlaying, isPaused]);

  /**
   * Resume a paused playback session.
   */
  const resumeHaptics = useCallback(() => {
    if (!isPlaying || !isPaused) return;
    pausedRef.current = false;
    setIsPaused(false);
    setStatus('playing');
  }, [isPlaying, isPaused]);

  // ── Cleanup on unmount ────────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      // Signal the async loop to exit so it doesn't update unmounted state
      cancelledRef.current = true;
      pausedRef.current    = false;
    };
  }, []);

  // ── Derived label for UI ──────────────────────────────────────────────────────
  const statusLabel = {
    idle:    'Ready',
    playing: `Playing… ${Math.round(progress * 100)}%`,
    paused:  `Paused at ${Math.round(progress * 100)}%`,
    stopped: 'Stopped',
    done:    'Complete',
  }[status] ?? 'Ready';

  return {
    isPlaying,
    isPaused,
    progress,
    currentIndex,
    status,
    statusLabel,
    startHaptics,
    stopHaptics,
    pauseHaptics,
    resumeHaptics,
  };
}
