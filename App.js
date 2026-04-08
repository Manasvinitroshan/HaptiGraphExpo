import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { StyleSheet } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import HomeScreen from './src/screens/HomeScreen';
import LearningScreen from './src/screens/LearningScreen';
import SplashScreen from './src/screens/SplashScreen';
import useGraphLearning from './src/hooks/useGraphLearning';

export default function App() {
  const [screen, setScreen] = useState('splash');
  const graphLearning = useGraphLearning();

  const handleStart = () => {
    const ready = graphLearning.generateGraphSession();
    if (ready) setScreen('learning');
  };

  if (screen === 'splash') {
    return (
      <SafeAreaProvider>
        <StatusBar style="light" />
        <SplashScreen onFinish={() => setScreen('home')} />
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.container}>
        <StatusBar style="light" />

        {screen === 'home' ? (
          <HomeScreen
            equation={graphLearning.equation}
            setEquation={graphLearning.setEquation}
            onStart={handleStart}
            isLoading={graphLearning.isLoading}
          />
        ) : (
          <LearningScreen
            equation={graphLearning.equation}
            graphData={graphLearning.graphData}
            onBack={() => setScreen('home')}
          />
        )}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f1117',
  },
});
