import React, { useState, useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { View, StyleSheet } from 'react-native';
import DashboardScreen from './src/screens/DashboardScreen';
import ConnectionScreen from './src/screens/ConnectionScreen';
import ConditionReportScreen from './src/screens/ConditionReportScreen';
import LoginScreen from './src/screens/LoginScreen';
import { COLORS } from './src/theme/colors';
import { onAuthStateChanged, User } from 'firebase/auth';
import { auth } from './src/config/firebase';

type Screen = 'login' | 'connection' | 'dashboard' | 'report';

export default function App() {
  const [screen, setScreen] = useState<Screen>('login');
  const [user, setUser] = useState<User | null>(null);
  const [authInitialized, setAuthInitialized] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        // Only set to connection screen if we were previously on login
        setScreen(prev => prev === 'login' ? 'connection' : prev);
      } else {
        setScreen('login');
      }
      setAuthInitialized(true);
    });

    return () => unsubscribe();
  }, []);

  // Show a blank dark screen while checking auth state to prevent flicker
  if (!authInitialized) {
    return <View style={styles.container} />;
  }

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      {screen === 'login' && (
        <LoginScreen />
      )}
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
