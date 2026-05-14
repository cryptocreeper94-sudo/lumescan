import React, { useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { View, StyleSheet } from 'react-native';
import DashboardScreen from './src/screens/DashboardScreen';
import ConnectionScreen from './src/screens/ConnectionScreen';
import ConditionReportScreen from './src/screens/ConditionReportScreen';
import { COLORS } from './src/theme/colors';

type Screen = 'connection' | 'dashboard' | 'report';

export default function App() {
  const [screen, setScreen] = useState<Screen>('connection');

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      {screen === 'connection' && (
        <ConnectionScreen onConnect={() => setScreen('dashboard')} />
      )}
      {screen === 'dashboard' && (
        <DashboardScreen onReport={() => setScreen('report')} />
      )}
      {screen === 'report' && (
        <ConditionReportScreen onBack={() => setScreen('dashboard')} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bgDark,
  },
});
