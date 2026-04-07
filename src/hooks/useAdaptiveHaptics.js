/**
 * useAdaptiveHaptics.js  (Expo version)
 *
 * Closed-loop RLHF hook. Identical logic to the bare-RN version but
 * uses expo-haptics via hapticEngine.js instead of react-native-haptic-feedback.
 *
 * Flow:
 *   1. playAdaptiveHaptics(graphData)
 *      — for each point: bandit selects action → haptic fires → action recorded
 *   2. submitUserFeedback(userGuess, confidence, trueFunction)
 *      — computes reward → updates bandit Q-table → logs interaction
 *
 * Compatible with HapticController (pass as haptics prop).
 * Extra fields: sessionReady, lastReward, lastBreakdown, submitUserFeedback.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { getAdaptiveHaptic } from '../ml/adaptiveEngine';
import interactionLogger from '../ml/interactionLogger';
import banditModel from '../ml/banditModel';
import { computeReward } from '../ml/rewardModel';
import { buildHapticSequence, playHapticEvent } from '../utils/hapticEngine';

export default function useAdaptiveHaptics() {

  const [isPlaying,    setIsPlaying]    = useState(false);
  const [isPaused,     setIsPaused]     = useState(false);
  const [progress,     setProgress]     = useState(0);
  const [status,       setStatus]       = useState('idle');
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [lastReward,    setLastReward]    = useState(null);
  const [lastBreakdown, setLastBreakdown] = useState(null);

  const cancelledRef        = useRef(false);
  const pausedRef           = useRef(false);
  const indexRef            = useRef(0);
  const totalRef            = useRef(0);
  const sessionActionsRef   = useRef([]);
  const playbackDoneTimeRef = useRef(0);

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  const waitWhilePaused = useCallback(async () => {
    while (pausedRef.current && !cancelledRef.current) await sleep(50);
  }, []);

  const runLoop = useCallback(async (sequence) => {
    const total = sequence.length;
    totalRef.current = total;

    for (let i = 0; i < total; i++) {
      if (cancelledRef.current) break;

      if (pausedRef.current) {
        indexRef.current = i;
        await waitWhilePaused();
        if (cancelledRef.current) break;
      }

      const event = sequence[i];

      // Bandit selects action for this point's state
      const adaptiveEvent = getAdaptiveHaptic(
        { slope: event.slope, curvature: event.curvature, feature: event.feature },
        banditModel,
      );

      playHapticEvent(adaptiveEvent);

      // Record action for reward update later
      sessionActionsRef.current.push({
        stateKey:  adaptiveEvent.stateKey,
        actionIdx: adaptiveEvent.actionIdx,
        action:    adaptiveEvent.action,
      });

      indexRef.current = i;
      setCurrentIndex(i);
      setProgress((i + 1) / total);

      if (i < total - 1) await sleep(adaptiveEvent.delay);
    }

    if (!cancelledRef.current) {
      playbackDoneTimeRef.current = Date.now();
      setStatus('done');
      setIsPlaying(false);
      setIsPaused(false);
      setProgress(1);
      setCurrentIndex(-1);
    }
  }, [waitWhilePaused]);

  const playAdaptiveHaptics = useCallback((graphData) => {
    if (isPlaying) return;
    if (!graphData?.points?.length) { setStatus('idle'); return; }

    const sequence = buildHapticSequence(graphData);
    if (!sequence.length) { setStatus('idle'); return; }

    cancelledRef.current        = false;
    pausedRef.current           = false;
    indexRef.current            = 0;
    sessionActionsRef.current   = [];
    playbackDoneTimeRef.current = 0;
    totalRef.current            = sequence.length;

    setProgress(0);
    setCurrentIndex(-1);
    setLastReward(null);
    setLastBreakdown(null);
    setIsPlaying(true);
    setIsPaused(false);
    setStatus('playing');

    runLoop(sequence);
  }, [isPlaying, runLoop]);

  const startHaptics = playAdaptiveHaptics;

  const stopHaptics = useCallback(() => {
    cancelledRef.current = true;
    pausedRef.current    = false;
    setIsPlaying(false);
    setIsPaused(false);
    setProgress(0);
    setCurrentIndex(-1);
    setStatus('stopped');
  }, []);

  const pauseHaptics = useCallback(() => {
    if (!isPlaying || isPaused) return;
    pausedRef.current = true;
    setIsPaused(true);
    setStatus('paused');
  }, [isPlaying, isPaused]);

  const resumeHaptics = useCallback(() => {
    if (!isPlaying || !isPaused) return;
    pausedRef.current = false;
    setIsPaused(false);
    setStatus('playing');
  }, [isPlaying, isPaused]);

  /**
   * Close the RLHF loop — compute reward and update the bandit.
   * @param {string} userGuess      e.g. "x^2"
   * @param {number} confidence     0–1
   * @param {string} trueFunction   the actual equation played
   */
  const submitUserFeedback = useCallback((userGuess, confidence, trueFunction) => {
    const responseTime = playbackDoneTimeRef.current > 0
      ? Date.now() - playbackDoneTimeRef.current
      : 0;

    const { reward, breakdown } = computeReward({
      trueFunction: trueFunction ?? '',
      userGuess:    userGuess    ?? '',
      responseTime,
      confidence:   confidence   ?? 0,
    });

    // Update bandit for every (state, action) pair from this session
    const { updateModel } = require('../ml/adaptiveEngine');
    for (const { stateKey, actionIdx } of sessionActionsRef.current) {
      updateModel(stateKey, actionIdx, reward, banditModel);
    }

    // Build dominant state/action summary for logging
    const stateCounts  = {};
    const actionCounts = [0, 0, 0];
    for (const { stateKey, actionIdx, action } of sessionActionsRef.current) {
      stateCounts[stateKey] = (stateCounts[stateKey] ?? 0) + 1;
      actionCounts[actionIdx]++;
    }
    const dominantStateKey  = Object.entries(stateCounts).sort((a,b) => b[1]-a[1])[0]?.[0] ?? 'low_flat';
    const dominantActionIdx = actionCounts.indexOf(Math.max(...actionCounts));
    const dominantAction    = sessionActionsRef.current.find((s) => s.actionIdx === dominantActionIdx)?.action
      ?? { intensity: 1.0, frequency: 150, duration: 80 };
    const [slopeBucket, curvBucket] = dominantStateKey.split('_');

    interactionLogger.logInteraction({
      state:        { slope: slopeBucket ?? 'unknown', curvature: curvBucket ?? 'unknown' },
      action:       { intensity: dominantAction.intensity, frequency: dominantAction.frequency, duration: dominantAction.duration },
      userGuess:    userGuess    ?? '',
      trueFunction: trueFunction ?? '',
      responseTime,
      confidence:   confidence   ?? 0,
      reward,
      timestamp: Date.now(),
    });

    setLastReward(reward);
    setLastBreakdown(breakdown);
    sessionActionsRef.current = [];

    return { reward, breakdown };
  }, []);

  useEffect(() => () => {
    cancelledRef.current = true;
    pausedRef.current    = false;
  }, []);

  const statusLabel = {
    idle:    'Ready',
    playing: `Playing… ${Math.round(progress * 100)}%`,
    paused:  `Paused at ${Math.round(progress * 100)}%`,
    stopped: 'Stopped',
    done:    'Complete — enter your guess below',
  }[status] ?? 'Ready';

  return {
    isPlaying, isPaused, progress, currentIndex,
    status, statusLabel,
    startHaptics, stopHaptics, pauseHaptics, resumeHaptics,
    playAdaptiveHaptics, submitUserFeedback,
    sessionReady: status === 'done' || status === 'stopped',
    lastReward, lastBreakdown,
  };
}
