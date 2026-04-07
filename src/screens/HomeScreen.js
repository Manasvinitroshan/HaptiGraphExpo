
import { ScrollView, StyleSheet, Text } from 'react-native';
import GraphInput from '../components/GraphInput';

export default function HomeScreen({ equation, setEquation, onStart, isLoading }) {
  return (
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
  );
}

const styles = StyleSheet.create({
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
