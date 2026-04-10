
import { useEffect, useRef } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import AudioEngine from '../components/AudioEngine';
import GraphInput from '../components/GraphInput';
import soundEngine from '../utils/soundEngine';

export default function HomeScreen({ equation, setEquation, onStart, isLoading, onDrawMode }) {
  const audioRef = useRef(null);

  useEffect(() => {
    soundEngine.setRef(audioRef.current);
  }, []);

  return (
    <View style={styles.flex}>
      <View style={styles.hidden}>
        <AudioEngine engineRef={audioRef} />
      </View>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>HaptiGraph</Text>
        <Text style={styles.subtitle}>Adaptive haptic graph learning</Text>
        <GraphInput
          equation={equation}
          onChangeEquation={setEquation}
          onSubmit={onStart}
          isLoading={isLoading}
        />
        <View style={styles.divider}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>or</Text>
          <View style={styles.dividerLine} />
        </View>
        <TouchableOpacity style={styles.drawBtn} onPress={onDrawMode}>
          <Text style={styles.drawBtnText}>✏️  Draw a Function</Text>
          <Text style={styles.drawBtnSub}>Sketch a curve and let the model classify it</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    backgroundColor: '#0f1117',
  },
  hidden: {
    position: 'absolute',
    width: 0,
    height: 0,
    overflow: 'hidden',
  },
  scroll: {
    flex: 1,
    backgroundColor: '#0f1117',
  },
  container: {
    padding: 24,
    paddingTop: 48,
    flexGrow: 1,
  },
  title: {
    fontSize: 32,
    fontWeight: '800',
    marginBottom: 8,
    color: '#e8eaf6',
  },
  subtitle: {
    fontSize: 15,
    marginBottom: 32,
    color: '#9fa8c0',
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 28,
    gap: 12,
  },
  dividerLine: { flex: 1, height: 1, backgroundColor: '#2a2f45' },
  dividerText: { color: '#3a3f52', fontSize: 13 },
  drawBtn: {
    backgroundColor: '#161b2e',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#2a2f45',
    padding: 20,
  },
  drawBtnText: { fontSize: 17, fontWeight: '700', color: '#e8eaf6', marginBottom: 4 },
  drawBtnSub: { fontSize: 13, color: '#9fa8c0' },
});
