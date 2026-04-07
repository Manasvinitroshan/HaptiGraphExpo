import { useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import GraphVisualizer from '../components/GraphVisualizer';
import HapticController from '../components/HapticController';
import useAdaptiveHaptics from '../hooks/useAdaptiveHaptics';

const CONFIDENCE_OPTIONS = [
  { label: 'Not sure', value: 0.2 },
  { label: 'Maybe',    value: 0.5 },
  { label: 'Certain',  value: 0.9 },
];

export default function LearningScreen({ equation, graphData, onBack }) {
  const haptics = useAdaptiveHaptics();

  const [guess,      setGuess]      = useState('');
  const [confidence, setConfidence] = useState(null);
  const [submitted,  setSubmitted]  = useState(false);

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
    haptics.submitUserFeedback(guess.trim(), confidence, equation);
    setSubmitted(true);
  };

  const rewardPercent = haptics.lastReward !== null
    ? Math.round(haptics.lastReward * 100)
    : null;

  const showGuessPanel = haptics.sessionReady && !submitted;
  const showRewardPanel = submitted && haptics.lastBreakdown;

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.container}
      keyboardShouldPersistTaps="handled">

      {/* Header */}
      <View style={styles.header}>
        <Pressable
          onPress={onBack}
          style={({ pressed }) => [styles.backBtn, pressed && styles.backBtnPressed]}
          accessibilityRole="button"
          accessibilityLabel="Back to home">
          <Text style={styles.backText}>← Back</Text>
        </Pressable>
        <Text style={styles.title}>Learning Session</Text>
        <Text style={styles.subtitle}>{equation}</Text>
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

      {/* Haptic controls — intercept Play to reset guess state */}
      <HapticController
        graphData={graphData}
        haptics={{ ...haptics, startHaptics: handlePlay }}
      />

      {/* Guess panel — shown after playback finishes or stops */}
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

      {/* Reward panel — shown after submission */}
      {showRewardPanel && (
        <RewardPanel
          reward={rewardPercent}
          breakdown={haptics.lastBreakdown}
          onPlayAgain={() => {
            setSubmitted(false);
            setGuess('');
            setConfidence(null);
          }}
        />
      )}

    </ScrollView>
  );
}

// ─── Reward panel ─────────────────────────────────────────────────────────────

function RewardPanel({ reward, breakdown, onPlayAgain }) {
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

      <Text style={styles.modelNote}>
        Haptic engine updated based on your response.
      </Text>

      <Pressable
        onPress={onPlayAgain}
        style={({ pressed }) => [styles.playAgainBtn, pressed && { opacity: 0.7 }]}
        accessibilityRole="button">
        <Text style={styles.playAgainText}>Try Again</Text>
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

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: '#0f1117' },
  container: { padding: 20, paddingTop: 48, gap: 20 },
  header: { gap: 4 },
  backBtn: { alignSelf: 'flex-start', paddingVertical: 6, paddingRight: 12, marginBottom: 8 },
  backBtnPressed: { opacity: 0.5 },
  backText: { color: '#4f9eff', fontSize: 15, fontWeight: '600' },
  title: { fontSize: 26, fontWeight: '800', color: '#e8eaf6' },
  subtitle: { fontSize: 15, color: '#9fa8c0', fontFamily: 'Menlo' },
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
  modelNote: { fontSize: 11, color: '#7a8099', textAlign: 'center', lineHeight: 16 },
  playAgainBtn: {
    borderWidth: 1.5, borderColor: '#4f9eff',
    borderRadius: 12, paddingVertical: 12, alignItems: 'center',
  },
  playAgainText: { fontSize: 14, fontWeight: '700', color: '#4f9eff' },
});
