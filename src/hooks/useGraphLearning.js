import { useState } from 'react';
import { parseEquationAdvanced } from '../utils/graphParser';

const DEFAULT_EQUATION = 'x^2';

export default function useGraphLearning() {
  const [equation, setEquation] = useState(DEFAULT_EQUATION);
  const [graphData, setGraphData] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [hapticStatus, setHapticStatus] = useState('Ready.');

  const generateGraphSession = () => {
    setIsLoading(true);
    setHapticStatus('Generating graph...');

    try {
      const data = parseEquationAdvanced(equation);
      if (!data || data.points.length === 0) {
        setHapticStatus('Invalid equation. Try something like x^2 or sin(x).');
        return false;
      }
      setGraphData(data);
      const { peaks, valleys, zeroCrossings } = data.features;
      setHapticStatus(
        `Graph ready — ${peaks.length} peak(s), ${valleys.length} valley(s), ` +
        `${zeroCrossings.length} zero crossing(s). Press Simulate to feel it.`
      );
      return true;
    } catch {
      setHapticStatus('Invalid equation. Use a simple formula like x^2 or sin(x).');
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  return {
    equation,
    setEquation,
    graphData,
    isLoading,
    hapticStatus,
    generateGraphSession,
  };
}
