/**
 * GraphInput.js
 *
 * Production-grade math equation input for the HaptiGraph learning app.
 * Designed for accessibility (VoiceOver / TalkBack), real-time validation,
 * and a touch-friendly math keyboard.
 *
 * Props:
 *   equation:           string                    current equation value
 *   onChangeEquation:   (value: string) => void   called on every change
 *   onSubmit:           () => void                called when graph is generated
 */

import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  AccessibilityInfo,
  Keyboard,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { parseEquation } from '../utils/graphParser';

// ─── Constants ────────────────────────────────────────────────────────────────

/** Preset example equations shown as quick-select chips */
const EXAMPLES = [
  { label: 'x²',        value: 'x^2'       },
  { label: 'sin(x)',    value: 'sin(x)'     },
  { label: 'cos(x)',    value: 'cos(x)'     },
  { label: 'x³',        value: 'x^3'        },
  { label: 'log(x+10)', value: 'log(x+10)'  },
  { label: '|x|',       value: 'abs(x)'     },
];

/** Buttons shown in the inline math keyboard */
const MATH_KEYS = [
  { label: 'x',    insert: 'x'    },
  { label: '+',    insert: '+'    },
  { label: '−',    insert: '-'    },
  { label: '×',    insert: '*'    },
  { label: '÷',    insert: '/'    },
  { label: '^',    insert: '^'    },
  { label: '(',    insert: '('    },
  { label: ')',    insert: ')'    },
  { label: 'sin',  insert: 'sin(' },
  { label: 'cos',  insert: 'cos(' },
  { label: 'tan',  insert: 'tan(' },
  { label: 'sqrt', insert: 'sqrt('},
  { label: 'log',  insert: 'log(' },
  { label: '⌫',    insert: null   },   // backspace — handled specially
];

const DEBOUNCE_MS = 350;

// ─── Colours ──────────────────────────────────────────────────────────────────

const C = {
  bg:          '#0f1117',
  surface:     '#1a1d2e',
  surfaceHigh: '#222638',
  border:      '#2e3248',
  borderFocus: '#4f9eff',
  borderError: '#ff4f4f',
  primary:     '#4f9eff',
  primaryDark: '#3b80d4',
  text:        '#e8eaf6',
  textSub:     '#9fa8c0',
  textMuted:   '#5a6080',
  chip:        '#1e2235',
  chipActive:  '#1e3a5f',
  chipBorder:  '#2e3a5a',
  error:       '#ff4f4f',
  success:     '#4fff91',
  keyBg:       '#1e2235',
  keyPress:    '#2a3150',
};

// ─── Validation ───────────────────────────────────────────────────────────────

/**
 * Validates an equation string.
 * Compiles via the parser — returns null on success, error string on failure.
 * @param {string} eq
 * @returns {string | null}
 */
function validateEquation(eq) {
  if (!eq.trim()) return null;                     // empty → no error shown
  try {
    const result = parseEquation(eq.trim());
    if (result.length === 0) return 'Invalid expression — check your syntax.';
    return null;
  } catch {
    return 'Invalid expression — check your syntax.';
  }
}

// ─── Debounce Hook ────────────────────────────────────────────────────────────

function useDebounce(fn, delay) {
  const timer = useRef(null);
  return useCallback((...args) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => fn(...args), delay);
  }, [fn, delay]);
}

// ─── Sub-components ───────────────────────────────────────────────────────────

/** A single quick-select example chip */
const ExampleChip = React.memo(({ label, value, active, onPress }) => (
  <Pressable
    onPress={() => onPress(value)}
    style={({ pressed }) => [
      styles.chip,
      active  && styles.chipActive,
      pressed && styles.chipPressed,
    ]}
    accessibilityRole="button"
    accessibilityLabel={`Use example: ${value}`}
    accessibilityState={{ selected: active }}
    hitSlop={6}>
    <Text style={[styles.chipText, active && styles.chipTextActive]}>
      {label}
    </Text>
  </Pressable>
));

/** A single key on the inline math keyboard */
const MathKey = React.memo(({ label, onPress }) => (
  <Pressable
    onPress={onPress}
    style={({ pressed }) => [
      styles.mathKey,
      pressed && styles.mathKeyPressed,
    ]}
    accessibilityRole="button"
    accessibilityLabel={label === '⌫' ? 'Backspace' : `Insert ${label}`}
    hitSlop={4}>
    <Text style={[styles.mathKeyText, label === '⌫' && styles.mathKeyBackspace]}>
      {label}
    </Text>
  </Pressable>
));

// ─── Main Component ───────────────────────────────────────────────────────────

export default function GraphInput({ equation, onChangeEquation, onSubmit }) {
  const inputRef = useRef(null);

  // cursor position for math keyboard insertions
  const selectionRef = useRef({ start: equation?.length ?? 0, end: equation?.length ?? 0 });

  const [isFocused, setIsFocused] = useState(false);
  const [error, setError]         = useState(null);
  const [charCount, setCharCount] = useState(equation?.length ?? 0);

  // ── Debounced validation ───────────────────────────────────────────────────
  const runValidation = useCallback((val) => {
    setError(validateEquation(val));
  }, []);
  const debouncedValidate = useDebounce(runValidation, DEBOUNCE_MS);

  // ── Sync external equation → internal char count ──────────────────────────
  useEffect(() => {
    setCharCount(equation?.length ?? 0);
  }, [equation]);

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleChange = useCallback((text) => {
    onChangeEquation(text);
    setCharCount(text.length);
    debouncedValidate(text);
  }, [onChangeEquation, debouncedValidate]);

  const handleSubmit = useCallback(() => {
    const err = validateEquation(equation);
    if (err) {
      setError(err);
      AccessibilityInfo.announceForAccessibility(`Error: ${err}`);
      return;
    }
    setError(null);
    Keyboard.dismiss();
    AccessibilityInfo.announceForAccessibility(
      `Generating graph for equation: ${equation}`
    );
    onSubmit?.();
  }, [equation, onSubmit]);

  const handleExamplePress = useCallback((value) => {
    onChangeEquation(value);
    setCharCount(value.length);
    setError(null);
    AccessibilityInfo.announceForAccessibility(`Equation set to ${value}`);
  }, [onChangeEquation]);

  /** Insert a string at the current cursor position */
  const handleMathKey = useCallback((key) => {
    if (key === null) {
      // Backspace
      const { start, end } = selectionRef.current;
      if (start === end && start > 0) {
        const next = equation.slice(0, start - 1) + equation.slice(end);
        onChangeEquation(next);
        debouncedValidate(next);
        setCharCount(next.length);
      } else if (start !== end) {
        const next = equation.slice(0, start) + equation.slice(end);
        onChangeEquation(next);
        debouncedValidate(next);
        setCharCount(next.length);
      }
      return;
    }
    const { start, end } = selectionRef.current;
    const next = equation.slice(0, start) + key + equation.slice(end);
    onChangeEquation(next);
    debouncedValidate(next);
    setCharCount(next.length);
  }, [equation, onChangeEquation, debouncedValidate]);

  // ── Derived state ──────────────────────────────────────────────────────────
  const hasValue   = equation?.trim().length > 0;
  const isValid    = hasValue && !error;
  const borderColor = error
    ? C.borderError
    : isFocused
      ? C.borderFocus
      : C.border;

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
      <View style={styles.root}>

        {/* ── Header ───────────────────────────────────────────────────── */}
        <Text style={styles.title}
          accessibilityRole="header">
          Enter a Math Equation
        </Text>
        <Text style={styles.description}>
          Type any equation using x as the variable. The graph will be
          generated across x = −10 to 10.
        </Text>

        {/* ── Example chips ────────────────────────────────────────────── */}
        <Text style={styles.sectionLabel}>Quick examples</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipsRow}
          accessibilityLabel="Example equations">
          {EXAMPLES.map((ex) => (
            <ExampleChip
              key={ex.value}
              label={ex.label}
              value={ex.value}
              active={equation === ex.value}
              onPress={handleExamplePress} />
          ))}
        </ScrollView>

        {/* ── Text input ───────────────────────────────────────────────── */}
        <View style={[styles.inputWrapper, { borderColor }]}>
          <TextInput
            ref={inputRef}
            value={equation}
            onChangeText={handleChange}
            onSubmitEditing={handleSubmit}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            onSelectionChange={(e) => {
              selectionRef.current = e.nativeEvent.selection;
            }}
            placeholder="e.g. sin(x) + x^2"
            placeholderTextColor={C.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="off"
            spellCheck={false}
            returnKeyType="done"
            keyboardType="default"
            style={[styles.input, error && styles.inputError]}
            accessibilityLabel="Equation input"
            accessibilityHint="Type a mathematical equation using x as the variable"
            accessibilityValue={{ text: equation }}
          />

          {/* Clear button */}
          {hasValue && (
            <Pressable
              onPress={() => {
                onChangeEquation('');
                setError(null);
                setCharCount(0);
                inputRef.current?.focus();
              }}
              style={styles.clearBtn}
              accessibilityRole="button"
              accessibilityLabel="Clear equation"
              hitSlop={8}>
              <Text style={styles.clearText}>✕</Text>
            </Pressable>
          )}
        </View>

        {/* ── Status row: error / valid indicator + char count ─────────── */}
        <View style={styles.statusRow}>
          {error ? (
            <Text style={styles.errorText}
              accessibilityRole="alert"
              accessibilityLiveRegion="polite">
              ⚠ {error}
            </Text>
          ) : isValid ? (
            <Text style={styles.validText}
              accessibilityLiveRegion="polite">
              ✓ Valid equation
            </Text>
          ) : (
            <Text style={styles.hintText}>
              Use x, +, −, *, /, ^, and functions like sin( )
            </Text>
          )}
          <Text style={styles.charCount}>{charCount} chars</Text>
        </View>

        {/* ── Inline math keyboard ─────────────────────────────────────── */}
        {isFocused && (
          <View style={styles.mathKeyboard}
            accessibilityLabel="Math keyboard"
            accessibilityHint="Tap keys to insert math symbols">
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.mathKeysRow}
              keyboardShouldPersistTaps="always">
              {MATH_KEYS.map((key) => (
                <MathKey
                  key={key.label}
                  label={key.label}
                  onPress={() => handleMathKey(key.insert)} />
              ))}
            </ScrollView>
          </View>
        )}

        {/* ── Generate button ───────────────────────────────────────────── */}
        <Pressable
          onPress={handleSubmit}
          disabled={!hasValue}
          style={({ pressed }) => [
            styles.generateBtn,
            !hasValue  && styles.generateBtnDisabled,
            pressed    && styles.generateBtnPressed,
          ]}
          accessibilityRole="button"
          accessibilityLabel="Generate graph"
          accessibilityHint={
            hasValue
              ? `Generate a haptic graph for ${equation}`
              : 'Enter an equation first'
          }
          accessibilityState={{ disabled: !hasValue }}>
          {({ pressed }) => (
            <Text style={[
              styles.generateBtnText,
              !hasValue && styles.generateBtnTextDisabled,
              pressed   && styles.generateBtnTextPressed,
            ]}>
              Generate Graph
            </Text>
          )}
        </Pressable>

      </View>
    </TouchableWithoutFeedback>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    width: '100%',
  },

  // Header
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: C.text,
    marginBottom: 6,
    letterSpacing: 0.2,
  },
  description: {
    fontSize: 13,
    color: C.textSub,
    lineHeight: 19,
    marginBottom: 20,
  },

  // Section label
  sectionLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: C.textMuted,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 10,
  },

  // Example chips
  chipsRow: {
    flexDirection: 'row',
    gap: 8,
    paddingRight: 8,
    marginBottom: 20,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: C.chip,
    borderWidth: 1,
    borderColor: C.chipBorder,
    minHeight: 36,
    justifyContent: 'center',
  },
  chipActive: {
    backgroundColor: C.chipActive,
    borderColor: C.primary,
  },
  chipPressed: {
    opacity: 0.75,
  },
  chipText: {
    fontSize: 13,
    color: C.textSub,
    fontWeight: '500',
  },
  chipTextActive: {
    color: C.primary,
    fontWeight: '700',
  },

  // Input wrapper
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.surface,
    borderWidth: 1.5,
    borderRadius: 12,
    paddingHorizontal: 14,
    minHeight: 52,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 4,
  },
  input: {
    flex: 1,
    fontSize: 17,
    color: C.text,
    fontFamily: 'Menlo',    // monospace on iOS; falls back gracefully
    paddingVertical: 12,
    letterSpacing: 0.5,
  },
  inputError: {
    color: C.error,
  },
  clearBtn: {
    padding: 6,
    marginLeft: 4,
    minWidth: 28,
    minHeight: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  clearText: {
    fontSize: 13,
    color: C.textMuted,
  },

  // Status row
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 7,
    marginBottom: 4,
    minHeight: 20,
  },
  errorText: {
    fontSize: 12,
    color: C.error,
    flex: 1,
  },
  validText: {
    fontSize: 12,
    color: C.success,
    flex: 1,
  },
  hintText: {
    fontSize: 12,
    color: C.textMuted,
    flex: 1,
  },
  charCount: {
    fontSize: 11,
    color: C.textMuted,
    marginLeft: 8,
  },

  // Math keyboard
  mathKeyboard: {
    marginTop: 10,
    marginBottom: 4,
    backgroundColor: C.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.border,
    paddingVertical: 6,
  },
  mathKeysRow: {
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 10,
    alignItems: 'center',
  },
  mathKey: {
    minWidth: 44,
    minHeight: 44,
    backgroundColor: C.keyBg,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  mathKeyPressed: {
    backgroundColor: C.keyPress,
    borderColor: C.primary,
  },
  mathKeyText: {
    fontSize: 14,
    color: C.text,
    fontWeight: '600',
  },
  mathKeyBackspace: {
    color: C.error,
  },

  // Generate button
  generateBtn: {
    marginTop: 20,
    backgroundColor: C.primary,
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
    shadowColor: C.primary,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 6,
  },
  generateBtnDisabled: {
    backgroundColor: C.surfaceHigh,
    shadowOpacity: 0,
    elevation: 0,
  },
  generateBtnPressed: {
    backgroundColor: C.primaryDark,
  },
  generateBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: 0.4,
  },
  generateBtnTextDisabled: {
    color: C.textMuted,
  },
  generateBtnTextPressed: {
    opacity: 0.9,
  },
});
