import { useEffect, useRef, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import AudioEngine from '../components/AudioEngine';
import GraphVisualizer from '../components/GraphVisualizer';
import HapticController from '../components/HapticController';
import useAdaptiveHaptics from '../hooks/useAdaptiveHaptics';
import soundEngine from '../utils/soundEngine';

const MAX_TRIALS = 3;

const CONFIDENCE_OPTIONS = [
  { label: 'Not sure', value: 0.2 },
  { label: 'Maybe',    value: 0.5 },
  { label: 'Certain',  value: 0.9 },
];

export default function LearningScreen({ equation, graphData, onBack }) {
  const haptics  = useAdaptiveHaptics();
  const audioRef = useRef(null);
  const [muted, setMuted] = useState(false);

  useEffect(() => {
    soundEngine.setRef(audioRef.current);
  }, []);

  // ── Per-attempt state ──────────────────────────────────────────────────────
  const [guess,      setGuess]      = useState('');
  const [confidence, setConfidence] = useState(null);
  const [submitted,  setSubmitted]  = useState(false);

  // ── Trial history ──────────────────────────────────────────────────────────
  // Each trial: { trialNum, guess, confidence, reward, breakdown }
  const [trials, setTrials] = useState([]);

  const trialNum    = trials.length + 1;          // 1-based, what trial we're on
  const allDone     = trials.length === MAX_TRIALS;

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    soundEngine.setMuted(next);
  };

  const peaks         = graphData?.features?.peaks?.length ?? 0;
  const valleys       = graphData?.features?.valleys?.length ?? 0;
  const zeroCrossings = graphData?.features?.zeroCrossings?.length ?? 0;

  const handlePlay = () => {
    setGuess('');
    setConfidence(null);
    setSubmitted(false);
    haptics.playAdaptiveHaptics(graphData);
  };

  const handleSubmit = () => {
    if (!guess.trim() || confidence === null) return;

    const result = haptics.submitUserFeedback(guess.trim(), confidence, equation);
    const newTrial = {
      trialNum,
      guess:      guess.trim(),
      confidence,
      reward:     result?.reward     ?? haptics.lastReward     ?? 0,
      breakdown:  result?.breakdown  ?? haptics.lastBreakdown  ?? {},
    };

    setTrials((prev) => [...prev, newTrial]);
    setSubmitted(true);
  };

  const handleTryAgain = () => {
    setSubmitted(false);
    setGuess('');
    setConfidence(null);
  };

  const rewardPercent = haptics.lastReward !== null
    ? Math.round(haptics.lastReward * 100)
    : null;

  const showGuessPanel  = haptics.sessionReady && !submitted;
  const showRewardPanel = submitted && haptics.lastBreakdown && !allDone;
  const showSummary     = allDone;

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.container}
      keyboardShouldPersistTaps="handled">

      <AudioEngine engineRef={audioRef} />

      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <Pressable
            onPress={onBack}
            style={({ pressed }) => [styles.backBtn, pressed && styles.backBtnPressed]}
            accessibilityRole="button"
            accessibilityLabel="Back to home">
            <Text style={styles.backText}>← Back</Text>
          </Pressable>
          <Pressable
            onPress={toggleMute}
            style={({ pressed }) => [styles.muteBtn, pressed && { opacity: 0.6 }]}
            accessibilityRole="button"
            accessibilityLabel={muted ? 'Unmute sound' : 'Mute sound'}>
            <Text style={styles.muteBtnText}>{muted ? '🔇' : '🔊'}</Text>
          </Pressable>
        </View>
        <Text style={styles.title}>Learning Session</Text>
        <Text style={styles.subtitle}>{equation}</Text>

        {/* Trial counter */}
        {!allDone && (
          <View style={styles.trialRow}>
            {Array.from({ length: MAX_TRIALS }, (_, i) => (
              <View
                key={i}
                style={[
                  styles.trialPip,
                  i < trials.length && styles.trialPipDone,
                  i === trials.length && styles.trialPipActive,
                ]}
              />
            ))}
            <Text style={styles.trialLabel}>
              Trial {Math.min(trialNum, MAX_TRIALS)} of {MAX_TRIALS}
            </Text>
          </View>
        )}
      </View>

      {/* Graph */}
      <GraphVisualizer
        data={graphData}
        currentIndex={haptics.currentIndex}
        showFeatures
        showSlope={false} />

      {/* Feature summary */}
      {graphData && (
        <View style={styles.statsRow}>
          <StatBadge color="#ff4f4f" label="Peaks"          value={peaks} />
          <StatBadge color="#4faaff" label="Valleys"        value={valleys} />
          <StatBadge color="#4fff91" label="Zero crossings" value={zeroCrossings} />
        </View>
      )}

      {/* Haptic controls */}
      {!allDone && (
        <HapticController
          graphData={graphData}
          haptics={{ ...haptics, startHaptics: handlePlay }}
        />
      )}

      {/* Guess panel */}
      {showGuessPanel && (
        <View style={styles.panel}>
          <Text style={styles.panelTitle}>What function did you feel?</Text>
          <Text style={styles.panelSubtitle}>
            Type the equation — e.g. x^2, sin(x), x^3 + 2x
          </Text>

          <TextInput
            style={styles.input}
            value={guess}
            onChangeText={setGuess}
            placeholder="e.g. x^2"
            placeholderTextColor="#4a5068"
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="done"
            accessibilityLabel="Enter your function guess"
          />

          <Text style={styles.confidenceLabel}>How confident are you?</Text>
          <View style={styles.confidenceRow}>
            {CONFIDENCE_OPTIONS.map((opt) => (
              <Pressable
                key={opt.label}
                onPress={() => setConfidence(opt.value)}
                style={({ pressed }) => [
                  styles.confidenceBtn,
                  confidence === opt.value && styles.confidenceBtnSelected,
                  pressed && { opacity: 0.7 },
                ]}
                accessibilityRole="button"
                accessibilityLabel={opt.label}>
                <Text style={[
                  styles.confidenceBtnText,
                  confidence === opt.value && styles.confidenceBtnTextSelected,
                ]}>
                  {opt.label}
                </Text>
              </Pressable>
            ))}
          </View>

          <Pressable
            onPress={handleSubmit}
            disabled={!guess.trim() || confidence === null}
            style={({ pressed }) => [
              styles.submitBtn,
              (!guess.trim() || confidence === null) && styles.submitBtnDisabled,
              pressed && styles.submitBtnPressed,
            ]}
            accessibilityRole="button"
            accessibilityLabel="Submit your guess">
            <Text style={[
              styles.submitText,
              (!guess.trim() || confidence === null) && styles.submitTextDisabled,
            ]}>
              Submit Guess
            </Text>
          </Pressable>
        </View>
      )}

      {/* Per-trial reward panel (trials 1 & 2 only) */}
      {showRewardPanel && (
        <RewardPanel
          trialNum={trials.length}
          reward={rewardPercent}
          breakdown={haptics.lastBreakdown}
          trialsLeft={MAX_TRIALS - trials.length}
          onTryAgain={handleTryAgain}
        />
      )}

      {/* Final summary after all 3 trials */}
      {showSummary && (
        <TrialSummary
          trials={trials}
          equation={equation}
          peaks={peaks}
          valleys={valleys}
          zeroCrossings={zeroCrossings}
          onBack={onBack}
        />
      )}

    </ScrollView>
  );
}

// ─── RewardPanel ──────────────────────────────────────────────────────────────

function RewardPanel({ trialNum, reward, breakdown, trialsLeft, onTryAgain }) {
  const isCorrect  = breakdown.isExact;
  const isPartial  = !isCorrect && breakdown.isSameSuperclass;
  const scoreColor = isCorrect ? '#4fff91' : isPartial ? '#f0b429' : '#ff4f4f';

  return (
    <View style={styles.panel}>
      <View style={styles.rewardHeader}>
        <Text style={[styles.rewardScore, { color: scoreColor }]}>{reward}%</Text>
        <Text style={styles.rewardTitle}>
          {isCorrect ? 'Correct!' : isPartial ? 'Close!' : 'Not quite'}
        </Text>
        <Text style={styles.trialTag}>Trial {trialNum} of {trialNum + trialsLeft}</Text>
      </View>

      <View style={styles.breakdownRow}>
        <View style={styles.breakdownItem}>
          <Text style={styles.breakdownItemLabel}>Your guess</Text>
          <Text style={[styles.breakdownItemValue, { color: isCorrect ? '#4fff91' : '#ff4f4f' }]}>
            {breakdown.guessClass}
          </Text>
        </View>
        <View style={styles.breakdownItem}>
          <Text style={styles.breakdownItemLabel}>Actual</Text>
          <Text style={[styles.breakdownItemValue, { color: '#9fa8c0' }]}>
            {breakdown.trueClass}
          </Text>
        </View>
      </View>

      <View style={styles.breakdownDetails}>
        <View style={styles.breakdownStat}>
          <Text style={styles.breakdownStatLabel}>Correctness</Text>
          <Text style={[styles.breakdownStatValue, { color: '#4fff91' }]}>
            +{Math.round(breakdown.correctness * 100)}%
          </Text>
        </View>
        {breakdown.timePenalty < 0 && (
          <View style={styles.breakdownStat}>
            <Text style={styles.breakdownStatLabel}>Slow response</Text>
            <Text style={[styles.breakdownStatValue, { color: '#ff4f4f' }]}>
              {Math.round(breakdown.timePenalty * 100)}%
            </Text>
          </View>
        )}
        {breakdown.confidenceBoost !== 0 && (
          <View style={styles.breakdownStat}>
            <Text style={styles.breakdownStatLabel}>
              {breakdown.confidenceBoost > 0 ? 'Confidence bonus' : 'Overconfidence'}
            </Text>
            <Text style={[styles.breakdownStatValue, { color: breakdown.confidenceBoost > 0 ? '#4f9eff' : '#f0b429' }]}>
              {breakdown.confidenceBoost > 0 ? '+' : ''}{Math.round(breakdown.confidenceBoost * 100)}%
            </Text>
          </View>
        )}
      </View>

      <Pressable
        onPress={onTryAgain}
        style={({ pressed }) => [styles.playAgainBtn, pressed && { opacity: 0.7 }]}
        accessibilityRole="button">
        <Text style={styles.playAgainText}>
          {trialsLeft > 0 ? `Try Again  (${trialsLeft} attempt${trialsLeft !== 1 ? 's' : ''} left)` : 'View Summary'}
        </Text>
      </Pressable>
    </View>
  );
}

// ─── TrialSummary ─────────────────────────────────────────────────────────────

function TrialSummary({ trials, equation, peaks, valleys, zeroCrossings, onBack }) {
  const scores  = trials.map((t) => Math.round(t.reward * 100));
  const avg     = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
  const best    = Math.max(...scores);
  const trend   = scores[2] - scores[0];        // final minus first
  const trendLabel = trend > 5 ? '↑ Improving' : trend < -5 ? '↓ Declining' : '→ Consistent';
  const trendColor = trend > 5 ? '#4fff91'    : trend < -5 ? '#ff4f4f'    : '#f0b429';

  const trueClass = trials[0]?.breakdown?.trueClass ?? '—';

  const CONF_LABELS = { 0.2: 'Not sure', 0.5: 'Maybe', 0.9: 'Certain' };

  return (
    <View style={styles.summaryCard}>

      {/* Title */}
      <Text style={styles.summaryTitle}>3-Trial Summary</Text>
      <Text style={styles.summaryEquation}>{equation}</Text>

      {/* Score bars */}
      <View style={styles.summaryBars}>
        {trials.map((t, i) => {
          const pct = scores[i];
          const isCorrect = t.breakdown.isExact;
          const isPartial = !isCorrect && t.breakdown.isSameSuperclass;
          const barColor  = isCorrect ? '#4fff91' : isPartial ? '#f0b429' : '#ff4f4f';
          return (
            <View key={i} style={styles.barRow}>
              <Text style={styles.barTrialLabel}>Trial {i + 1}</Text>
              <View style={styles.barTrack}>
                <View style={[styles.barFill, { width: `${pct}%`, backgroundColor: barColor }]} />
              </View>
              <Text style={[styles.barScore, { color: barColor }]}>{pct}%</Text>
              <Text style={styles.barGuess} numberOfLines={1}>{t.guess}</Text>
            </View>
          );
        })}
      </View>

      {/* Aggregate stats */}
      <View style={styles.statsGrid}>
        <View style={styles.statCell}>
          <Text style={styles.statValue}>{avg}%</Text>
          <Text style={styles.statKey}>Average</Text>
        </View>
        <View style={styles.statCell}>
          <Text style={[styles.statValue, { color: '#4fff91' }]}>{best}%</Text>
          <Text style={styles.statKey}>Best</Text>
        </View>
        <View style={styles.statCell}>
          <Text style={[styles.statValue, { color: trendColor }]}>{trendLabel}</Text>
          <Text style={styles.statKey}>Trend</Text>
        </View>
      </View>

      {/* Per-trial breakdown */}
      <View style={styles.detailTable}>
        <View style={styles.detailHeader}>
          <Text style={[styles.detailCell, styles.detailHead, { flex: 0.6 }]}>#</Text>
          <Text style={[styles.detailCell, styles.detailHead, { flex: 2 }]}>Guess</Text>
          <Text style={[styles.detailCell, styles.detailHead, { flex: 1.5 }]}>Confidence</Text>
          <Text style={[styles.detailCell, styles.detailHead, { flex: 1 }]}>Score</Text>
          <Text style={[styles.detailCell, styles.detailHead, { flex: 1.2 }]}>Correctness</Text>
        </View>
        {trials.map((t, i) => {
          const isCorrect = t.breakdown.isExact;
          const isPartial = !isCorrect && t.breakdown.isSameSuperclass;
          const status    = isCorrect ? '✓ Exact' : isPartial ? '~ Close' : '✗ Wrong';
          const statusCol = isCorrect ? '#4fff91' : isPartial ? '#f0b429' : '#ff4f4f';
          return (
            <View key={i} style={[styles.detailRow, i % 2 === 0 && styles.detailRowAlt]}>
              <Text style={[styles.detailCell, { flex: 0.6, color: '#9fa8c0' }]}>{i + 1}</Text>
              <Text style={[styles.detailCell, { flex: 2 }]} numberOfLines={1}>{t.guess}</Text>
              <Text style={[styles.detailCell, { flex: 1.5, color: '#9fa8c0' }]}>
                {CONF_LABELS[t.confidence] ?? '—'}
              </Text>
              <Text style={[styles.detailCell, { flex: 1, color: statusCol }]}>{scores[i]}%</Text>
              <Text style={[styles.detailCell, { flex: 1.2, color: statusCol }]}>{status}</Text>
            </View>
          );
        })}
      </View>

      {/* Graph features */}
      <View style={styles.featureRow}>
        <FeaturePill color="#ff4f4f" label={`${peaks} peak${peaks !== 1 ? 's' : ''}`} />
        <FeaturePill color="#4faaff" label={`${valleys} valle${valleys !== 1 ? 'ys' : 'y'}`} />
        <FeaturePill color="#4fff91" label={`${zeroCrossings} zero crossing${zeroCrossings !== 1 ? 's' : ''}`} />
      </View>

      {/* Revealed function class */}
      <View style={styles.revealRow}>
        <Text style={styles.revealLabel}>Function class</Text>
        <Text style={styles.revealValue}>{trueClass}</Text>
      </View>

      <Pressable
        onPress={onBack}
        style={({ pressed }) => [styles.newFnBtn, pressed && { opacity: 0.7 }]}
        accessibilityRole="button"
        accessibilityLabel="Try a new function">
        <Text style={styles.newFnText}>Try a New Function</Text>
      </Pressable>
    </View>
  );
}

// ─── StatBadge ────────────────────────────────────────────────────────────────

const StatBadge = ({ color, label, value }) => (
  <View style={styles.badge}>
    <View style={[styles.badgeDot, { backgroundColor: color }]} />
    <Text style={styles.badgeValue}>{value}</Text>
    <Text style={styles.badgeLabel}>{label}</Text>
  </View>
);

const FeaturePill = ({ color, label }) => (
  <View style={[styles.featurePill, { borderColor: color }]}>
    <View style={[styles.featurePillDot, { backgroundColor: color }]} />
    <Text style={[styles.featurePillText, { color }]}>{label}</Text>
  </View>
);

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: '#0f1117' },
  container: { padding: 20, paddingTop: 48, gap: 20 },

  header: { gap: 4 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  muteBtn: { padding: 8 },
  muteBtnText: { fontSize: 20 },
  backBtn: { alignSelf: 'flex-start', paddingVertical: 6, paddingRight: 12, marginBottom: 8 },
  backBtnPressed: { opacity: 0.5 },
  backText: { color: '#4f9eff', fontSize: 15, fontWeight: '600' },
  title: { fontSize: 26, fontWeight: '800', color: '#e8eaf6' },
  subtitle: { fontSize: 15, color: '#9fa8c0', fontFamily: 'Menlo' },

  trialRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 },
  trialPip: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#2e3248', borderWidth: 1, borderColor: '#3a4060' },
  trialPipDone: { backgroundColor: '#4fff91', borderColor: '#4fff91' },
  trialPipActive: { backgroundColor: '#4f9eff', borderColor: '#4f9eff' },
  trialLabel: { fontSize: 12, color: '#9fa8c0', marginLeft: 4 },

  statsRow: {
    flexDirection: 'row', justifyContent: 'space-around',
    backgroundColor: '#1a1d2e', borderRadius: 12, paddingVertical: 16,
    borderWidth: 1, borderColor: '#2e3248',
  },
  badge: { alignItems: 'center', gap: 4 },
  badgeDot: { width: 10, height: 10, borderRadius: 5 },
  badgeValue: { fontSize: 22, fontWeight: '800', color: '#e8eaf6' },
  badgeLabel: { fontSize: 11, color: '#7a8099' },

  panel: {
    backgroundColor: '#1a1d2e', borderRadius: 14,
    borderWidth: 1, borderColor: '#2e3248', padding: 18, gap: 14,
  },
  panelTitle: { fontSize: 16, fontWeight: '700', color: '#e8eaf6' },
  panelSubtitle: { fontSize: 12, color: '#9fa8c0', lineHeight: 18 },
  input: {
    backgroundColor: '#12151f', borderWidth: 1, borderColor: '#2e3248',
    borderRadius: 10, paddingVertical: 12, paddingHorizontal: 14,
    color: '#e8eaf6', fontSize: 16, fontFamily: 'Menlo',
  },
  confidenceLabel: { fontSize: 12, color: '#9fa8c0', fontWeight: '600' },
  confidenceRow: { flexDirection: 'row', gap: 8 },
  confidenceBtn: {
    flex: 1, paddingVertical: 10, alignItems: 'center',
    borderRadius: 10, borderWidth: 1.5, borderColor: '#2e3248',
  },
  confidenceBtnSelected: { borderColor: '#4f9eff', backgroundColor: '#4f9eff22' },
  confidenceBtnText: { fontSize: 12, fontWeight: '600', color: '#9fa8c0' },
  confidenceBtnTextSelected: { color: '#4f9eff' },
  submitBtn: { backgroundColor: '#4fff91', borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  submitBtnDisabled: { backgroundColor: '#3a3f55' },
  submitBtnPressed: { opacity: 0.8 },
  submitText: { fontSize: 15, fontWeight: '700', color: '#0f1117' },
  submitTextDisabled: { color: '#6a7088' },

  rewardHeader: { alignItems: 'center', gap: 4 },
  rewardScore: { fontSize: 48, fontWeight: '900' },
  rewardTitle: { fontSize: 16, fontWeight: '700', color: '#e8eaf6' },
  trialTag: { fontSize: 11, color: '#5a6080', marginTop: 2 },
  breakdownRow: {
    flexDirection: 'row', justifyContent: 'space-around',
    backgroundColor: '#12151f', borderRadius: 10, paddingVertical: 12,
  },
  breakdownItem: { alignItems: 'center', gap: 4 },
  breakdownItemLabel: { fontSize: 11, color: '#7a8099' },
  breakdownItemValue: { fontSize: 14, fontWeight: '700' },
  breakdownDetails: { gap: 6 },
  breakdownStat: { flexDirection: 'row', justifyContent: 'space-between' },
  breakdownStatLabel: { fontSize: 13, color: '#9fa8c0' },
  breakdownStatValue: { fontSize: 13, fontWeight: '700' },
  playAgainBtn: {
    borderWidth: 1.5, borderColor: '#4f9eff',
    borderRadius: 12, paddingVertical: 12, alignItems: 'center',
  },
  playAgainText: { fontSize: 14, fontWeight: '700', color: '#4f9eff' },

  // ── Trial Summary ──────────────────────────────────────────────────────────
  summaryCard: {
    backgroundColor: '#1a1d2e', borderRadius: 16,
    borderWidth: 1, borderColor: '#2e3248', padding: 20, gap: 18,
  },
  summaryTitle: { fontSize: 20, fontWeight: '800', color: '#e8eaf6' },
  summaryEquation: { fontSize: 14, color: '#9fa8c0', fontFamily: 'Menlo', marginTop: -10 },

  summaryBars: { gap: 10 },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  barTrialLabel: { fontSize: 11, color: '#7a8099', width: 40 },
  barTrack: { flex: 1, height: 10, backgroundColor: '#12151f', borderRadius: 5, overflow: 'hidden' },
  barFill:  { height: '100%', borderRadius: 5 },
  barScore: { fontSize: 12, fontWeight: '700', width: 36, textAlign: 'right' },
  barGuess: { fontSize: 11, color: '#5a6080', width: 60, fontFamily: 'Menlo' },

  statsGrid: {
    flexDirection: 'row', justifyContent: 'space-around',
    backgroundColor: '#12151f', borderRadius: 12, paddingVertical: 14,
  },
  statCell:  { alignItems: 'center', gap: 4 },
  statValue: { fontSize: 18, fontWeight: '800', color: '#e8eaf6' },
  statKey:   { fontSize: 10, color: '#7a8099', textTransform: 'uppercase', letterSpacing: 0.6 },

  detailTable: { gap: 0, borderRadius: 10, overflow: 'hidden', borderWidth: 1, borderColor: '#2e3248' },
  detailHeader: { flexDirection: 'row', backgroundColor: '#12151f', paddingVertical: 8, paddingHorizontal: 10 },
  detailRow:    { flexDirection: 'row', paddingVertical: 9, paddingHorizontal: 10 },
  detailRowAlt: { backgroundColor: '#161926' },
  detailHead:   { fontSize: 10, fontWeight: '700', color: '#5a6080', textTransform: 'uppercase', letterSpacing: 0.4 },
  detailCell:   { fontSize: 12, color: '#e8eaf6' },

  featureRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  featurePill: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    borderWidth: 1, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5,
  },
  featurePillDot:  { width: 6, height: 6, borderRadius: 3 },
  featurePillText: { fontSize: 12, fontWeight: '600' },

  revealRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: '#12151f', borderRadius: 10, paddingVertical: 12, paddingHorizontal: 14,
  },
  revealLabel: { fontSize: 12, color: '#7a8099' },
  revealValue: { fontSize: 14, fontWeight: '700', color: '#4f9eff', textTransform: 'capitalize' },

  newFnBtn: {
    backgroundColor: '#4f9eff', borderRadius: 12,
    paddingVertical: 14, alignItems: 'center',
  },
  newFnText: { fontSize: 15, fontWeight: '700', color: '#fff' },
});
