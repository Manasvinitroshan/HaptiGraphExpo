
import { useEffect, useRef } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import AudioEngine from '../components/AudioEngine';
import GraphInput from '../components/GraphInput';
import soundEngine from '../utils/soundEngine';

export default function HomeScreen({ equation, setEquation, onStart, isLoading }) {
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
});
