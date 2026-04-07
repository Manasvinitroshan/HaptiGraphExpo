import React, { useRef, useState } from 'react';
import {
  Dimensions,
  PanResponder,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Line, Path, Text as SvgText } from 'react-native-svg';
import { classifyDrawnFunction } from '../ml/functionClassifier';

const { width, height } = Dimensions.get('window');
const CANVAS_W = width - 48;
const CANVAS_H = Math.min(320, height * 0.38);

const THROTTLE = 4; // re-render every N points

export default function DrawScreen({ onBack }) {
  const [pathData, setPathData] = useState('');
  const [result, setResult] = useState(null);
  const pointsRef = useRef([]);
  const pathRef = useRef('');
  const pendingRef = useRef(0);

  const panResponder = useRef(
    PanResponder.create({
      // Capture immediately so ScrollView ancestors can't steal the gesture
      onStartShouldSetPanResponder: () => true,
      onStartShouldSetPanResponderCapture: () => true,
      onMoveShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponderCapture: () => true,

      onPanResponderGrant: evt => {
        const { locationX, locationY } = evt.nativeEvent;
        const pt = { x: clamp(locationX, CANVAS_W), y: clamp(locationY, CANVAS_H) };
        pointsRef.current = [pt];
        const d = `M ${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`;
        pathRef.current = d;
        pendingRef.current = 0;
        setPathData(d);
        setResult(null);
      },

      onPanResponderMove: evt => {
        const { locationX, locationY } = evt.nativeEvent;
        const pt = { x: clamp(locationX, CANVAS_W), y: clamp(locationY, CANVAS_H) };
        pointsRef.current.push(pt);
        pathRef.current += ` L ${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`;
        pendingRef.current += 1;
        // Throttle: only update React state every THROTTLE points
        if (pendingRef.current >= THROTTLE) {
          pendingRef.current = 0;
          const snap = pathRef.current;
          setPathData(snap);
        }
      },

      onPanResponderRelease: () => {
        // Always flush final path
        setPathData(pathRef.current);
        if (pointsRef.current.length >= 10) {
          setResult(classifyDrawnFunction(pointsRef.current, CANVAS_W, CANVAS_H));
        }
      },
    })
  ).current;

  const handleClear = () => {
    pointsRef.current = [];
    pathRef.current = '';
    pendingRef.current = 0;
    setPathData('');
    setResult(null);
  };

  const midY = CANVAS_H / 2;
  const midX = CANVAS_W / 2;

  return (
    <SafeAreaView style={styles.root}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} hitSlop={{ top: 12, bottom: 12, left: 16, right: 16 }}>
          <Text style={styles.back}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Draw a Function</Text>
      </View>

      <Text style={styles.hint}>Draw any curve — the model will classify it</Text>

      {/* Canvas */}
      <View style={styles.canvasWrapper} {...panResponder.panHandlers}>
        <Svg width={CANVAS_W} height={CANVAS_H}>
          {/* Axes */}
          <Line x1={0} y1={midY} x2={CANVAS_W} y2={midY} stroke="#3a3f52" strokeWidth={1.5} />
          <Line x1={midX} y1={0} x2={midX} y2={CANVAS_H} stroke="#3a3f52" strokeWidth={1.5} />
          {/* Tick marks */}
          {[-0.5, 0.5].map(t => (
            <React.Fragment key={t}>
              <Line x1={midX + t * CANVAS_W * 0.5} y1={midY - 5} x2={midX + t * CANVAS_W * 0.5} y2={midY + 5} stroke="#3a3f52" strokeWidth={1} />
              <Line x1={midX - 5} y1={midY - t * CANVAS_H * 0.5} x2={midX + 5} y2={midY - t * CANVAS_H * 0.5} stroke="#3a3f52" strokeWidth={1} />
            </React.Fragment>
          ))}
          <SvgText x={CANVAS_W - 14} y={midY - 7} fill="#4a5068" fontSize={11}>x</SvgText>
          <SvgText x={midX + 8} y={13} fill="#4a5068" fontSize={11}>y</SvgText>

          {/* Drawn path */}
          {pathData ? (
            <Path d={pathData} stroke="#00D4FF" strokeWidth={3} fill="none" strokeLinecap="round" strokeLinejoin="round" />
          ) : null}
        </Svg>

        {!pathData && (
          <View style={styles.placeholder} pointerEvents="none">
            <Text style={styles.placeholderText}>Draw here</Text>
          </View>
        )}
      </View>

      {/* Controls */}
      <View style={styles.controls}>
        <TouchableOpacity style={styles.clearBtn} onPress={handleClear}>
          <Text style={styles.clearBtnText}>Clear</Text>
        </TouchableOpacity>
      </View>

      {/* Result */}
      {result && (
        <View style={styles.resultCard}>
          <Text style={styles.resultLabel}>Detected Function</Text>
          <Text style={styles.resultType}>{result.type}</Text>
          <Text style={styles.resultEquation}>{result.equation}</Text>
          <View style={styles.confidenceRow}>
            <Text style={styles.confidenceLabel}>Confidence</Text>
            <View style={styles.confidenceBar}>
              <View style={[styles.confidenceFill, { width: `${result.confidence * 100}%` }]} />
            </View>
            <Text style={styles.confidencePct}>{Math.round(result.confidence * 100)}%</Text>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

function clamp(val, max) {
  return Math.max(0, Math.min(max, val));
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0f1117', padding: 24 },

  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 8, gap: 16 },
  back: { color: '#00D4FF', fontSize: 16 },
  title: { fontSize: 22, fontWeight: '700', color: '#e8eaf6' },
  hint: { fontSize: 14, color: '#9fa8c0', marginBottom: 20 },

  canvasWrapper: {
    width: CANVAS_W,
    height: CANVAS_H,
    backgroundColor: '#161b2e',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2a2f45',
    overflow: 'hidden',
    alignSelf: 'center',
  },
  placeholder: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderText: { color: '#3a3f52', fontSize: 15 },

  controls: { marginTop: 14, alignItems: 'flex-end' },
  clearBtn: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#3a3f52',
  },
  clearBtnText: { color: '#9fa8c0', fontSize: 14 },

  resultCard: {
    marginTop: 24,
    backgroundColor: '#161b2e',
    borderRadius: 14,
    padding: 20,
    borderWidth: 1,
    borderColor: '#00D4FF33',
  },
  resultLabel: { fontSize: 12, color: '#9fa8c0', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 },
  resultType: { fontSize: 28, fontWeight: '800', color: '#00D4FF', marginBottom: 4 },
  resultEquation: { fontSize: 17, color: '#e8eaf6', fontFamily: 'monospace', marginBottom: 16 },
  confidenceRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  confidenceLabel: { fontSize: 12, color: '#9fa8c0', width: 72 },
  confidenceBar: { flex: 1, height: 6, backgroundColor: '#2a2f45', borderRadius: 3, overflow: 'hidden' },
  confidenceFill: { height: '100%', backgroundColor: '#00D4FF', borderRadius: 3 },
  confidencePct: { fontSize: 13, color: '#e8eaf6', width: 36, textAlign: 'right' },
});
