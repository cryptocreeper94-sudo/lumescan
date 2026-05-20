import React, { useState, useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { View, StyleSheet, Text, TouchableOpacity, Linking, ActivityIndicator } from 'react-native';
import DashboardScreen from './src/screens/DashboardScreen';
import ConnectionScreen from './src/screens/ConnectionScreen';
import ConditionReportScreen from './src/screens/ConditionReportScreen';
import LoginScreen from './src/screens/LoginScreen';
import { COLORS } from './src/theme/colors';
import { auth, onAuthStateChanged, type User } from './src/config/firebase';
import { checkEntitlement, type EntitlementStatus } from './src/config/entitlement';

type Screen = 'login' | 'checking' | 'locked' | 'connection' | 'dashboard' | 'report';

export default function App() {
  const [screen, setScreen] = useState<Screen>('login');
  const [user, setUser] = useState<User | null>(null);
  const [authInitialized, setAuthInitialized] = useState(false);
  const [entitlement, setEntitlement] = useState<EntitlementStatus | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        // Show checking screen while verifying entitlement
        setScreen('checking');
        const status = await checkEntitlement();
        setEntitlement(status);
        if (status.entitled) {
          setScreen('connection');
        } else {
          setScreen('locked');
        }
      } else {
        setScreen('login');
        setEntitlement(null);
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
      {screen === 'checking' && (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={COLORS.accent} />
          <Text style={styles.checkingText}>Verifying license...</Text>
        </View>
      )}
      {screen === 'locked' && (
        <View style={styles.center}>
          <Text style={styles.lockIcon}>🔒</Text>
          <Text style={styles.lockTitle}>Lume Scan License Required</Text>
          <Text style={styles.lockDesc}>
            Get full access to 42-signal diagnostics, predictive maintenance, and fuel coaching for a one-time purchase of $29.99.
          </Text>
          <TouchableOpacity
            style={styles.buyBtn}
            onPress={() => Linking.openURL('https://lumeauto.tech/order')}
          >
            <Text style={styles.buyBtnText}>🔧 Get Lume Scan — $29.99</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.refreshBtn}
            onPress={async () => {
              setScreen('checking');
              const status = await checkEntitlement();
              setEntitlement(status);
              setScreen(status.entitled ? 'connection' : 'locked');
            }}
          >
            <Text style={styles.refreshBtnText}>I already purchased — refresh</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.signOutBtn}
            onPress={() => auth.signOut()}
          >
            <Text style={styles.signOutText}>Sign out</Text>
          </TouchableOpacity>
        </View>
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
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    backgroundColor: COLORS.bgDark,
  },
  checkingText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 14,
    marginTop: 16,
  },
  lockIcon: {
    fontSize: 48,
    marginBottom: 20,
  },
  lockTitle: {
    color: '#f0f4f8',
    fontSize: 22,
    fontWeight: '800',
    marginBottom: 12,
    textAlign: 'center',
  },
  lockDesc: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 14,
    lineHeight: 22,
    textAlign: 'center',
    marginBottom: 32,
    maxWidth: 320,
  },
  buyBtn: {
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 14,
    backgroundColor: COLORS.accent || '#10b981',
    marginBottom: 16,
  },
  buyBtnText: {
    color: '#000',
    fontSize: 16,
    fontWeight: '800',
  },
  refreshBtn: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    marginBottom: 12,
  },
  refreshBtnText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 13,
  },
  signOutBtn: {
    paddingVertical: 8,
    marginTop: 8,
  },
  signOutText: {
    color: 'rgba(255,255,255,0.3)',
    fontSize: 12,
  },
});
