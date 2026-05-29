import React, { useState, useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { View, StyleSheet, Text, TouchableOpacity, Linking, ActivityIndicator } from 'react-native';
import { Activity, FileText, Key, Radio, Settings as SettingsIcon, AlertTriangle, Wrench, Navigation, Clock } from 'lucide-react-native';
import DashboardScreen from './src/screens/DashboardScreen';
import ConnectionScreen from './src/screens/ConnectionScreen';
import ConditionReportScreen from './src/screens/ConditionReportScreen';
import KeyManagementScreen from './src/screens/KeyManagementScreen';
import RemoteStartScreen from './src/screens/RemoteStartScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import LoginScreen from './src/screens/LoginScreen';
import DTCScreen from './src/screens/DTCScreen';
import MaintenanceScreen from './src/screens/MaintenanceScreen';
import TripComputerScreen from './src/screens/TripComputerScreen';
import ScanHistoryScreen from './src/screens/ScanHistoryScreen';
import { COLORS } from './src/theme/colors';
import { auth, onAuthStateChanged, type User } from './src/config/firebase';
import { checkEntitlement, type EntitlementStatus } from './src/config/entitlement';
import OnboardingScreen from './src/screens/OnboardingScreen';
import AsyncStorage from '@react-native-async-storage/async-storage';

type AppState = 'login' | 'checking' | 'locked' | 'onboarding' | 'connection' | 'main';
type Tab = 'dashboard' | 'codes' | 'report' | 'service' | 'trip' | 'history' | 'keys' | 'remote' | 'settings';

export default function App() {
  const [appState, setAppState] = useState<AppState>('login');
  const [activeTab, setActiveTab] = useState<Tab>('dashboard');
  const [user, setUser] = useState<User | null>(null);
  const [authInitialized, setAuthInitialized] = useState(false);
  const [entitlement, setEntitlement] = useState<EntitlementStatus | null>(null);
  const [mechanicMode, setMechanicMode] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        setAppState('checking');
        const status = await checkEntitlement();
        setEntitlement(status);
        if (status.entitled) {
          // Check if onboarding has been completed
          const onboarded = await AsyncStorage.getItem('@lumescan_onboarded');
          setAppState(onboarded ? 'connection' : 'onboarding');
        } else {
          setAppState('locked');
        }
      } else {
        setAppState('login');
        setEntitlement(null);
      }
      setAuthInitialized(true);
    });
    return () => unsubscribe();
  }, []);

  if (!authInitialized) {
    return <View style={styles.container} />;
  }

  const tier = entitlement?.tier || 'free';
  const mode05 = entitlement?.mode05Purchased || false;
  const mode06 = entitlement?.mode06Active || false;

  // Consumer mode tabs: Dashboard, Codes, Report, Service, Settings
  // Mechanic mode tabs: Dashboard, Codes, Report, Service, Keys, Remote, Settings
  // Trip + History are accessible via Dashboard or Settings as sub-nav
  const tabs: { id: Tab; label: string; icon: any; mechOnly?: boolean; proOnly?: boolean }[] = [
    { id: 'dashboard', label: 'Live', icon: Activity },
    { id: 'codes', label: 'Codes', icon: AlertTriangle },
    { id: 'trip', label: 'Trip', icon: Navigation, proOnly: true },
    { id: 'service', label: 'Service', icon: Wrench },
    { id: 'history', label: 'History', icon: Clock },
    { id: 'keys', label: 'Keys', icon: Key, mechOnly: true },
    { id: 'remote', label: 'Start', icon: Radio, mechOnly: true },
    { id: 'settings', label: 'Settings', icon: SettingsIcon },
  ];

  const visibleTabs = tabs.filter(t => {
    if (t.mechOnly && !mechanicMode) return false;
    // Pro-only tabs still visible but will show upgrade screen
    return true;
  });

  // If user switches from mechanic to consumer while on a mechanic-only tab
  if (!mechanicMode && (activeTab === 'keys' || activeTab === 'remote')) {
    setActiveTab('dashboard');
  }

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      {/* Pre-auth screens */}
      {appState === 'login' && <LoginScreen />}
      {appState === 'checking' && (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={COLORS.cyan} />
          <Text style={styles.checkingText}>Verifying license...</Text>
        </View>
      )}
      {appState === 'locked' && (
        <View style={styles.center}>
          <Text style={styles.lockIcon}>🔧</Text>
          <Text style={styles.lockTitle}>Connection Issue</Text>
          <Text style={styles.lockDesc}>
            We couldn't verify your license right now. You can continue in Free Mode (3 live signals) or upgrade to Pro for the full 42-signal engine.
          </Text>
          <TouchableOpacity style={[styles.refreshBtn, { backgroundColor: 'rgba(6,182,212,0.15)', borderColor: 'rgba(6,182,212,0.3)' }]} onPress={() => {
            setEntitlement({ entitled: true, tier: 'free', reason: 'free_tier' });
            setAppState('connection');
          }}>
            <Text style={[styles.refreshBtnText, { color: '#06b6d4' }]}>Continue in Free Mode</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.refreshBtn} onPress={async () => {
            setAppState('checking');
            const status = await checkEntitlement();
            setEntitlement(status);
            setAppState(status.entitled ? 'connection' : 'locked');
          }}>
            <Text style={styles.refreshBtnText}>Retry License Check</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.refreshBtn} onPress={() => Linking.openURL('https://lumeauto.tech/order')}>
            <Text style={[styles.refreshBtnText, { color: '#10b981' }]}>Get Lume Scan Pro →</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.signOutBtn} onPress={() => auth.signOut()}>
            <Text style={styles.signOutText}>Sign out</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Onboarding walkthrough — first run only */}
      {appState === 'onboarding' && (
        <OnboardingScreen onComplete={async () => {
          await AsyncStorage.setItem('@lumescan_onboarded', 'true');
          setAppState('connection');
        }} />
      )}

      {/* Connection screen */}
      {appState === 'connection' && (
        <View style={{ flex: 1 }}>
          {user && (
            <View style={styles.greetingBar}>
              <Text style={styles.greetingText}>
                {new Date().getHours() < 12 ? 'Good morning' : new Date().getHours() < 17 ? 'Good afternoon' : 'Good evening'}
                {', '}
                <Text style={styles.greetingName}>
                  {user.displayName?.split(' ')[0] || user.email?.split('@')[0] || 'Driver'}
                </Text>
                {' 👋'}
              </Text>
            </View>
          )}
          <ConnectionScreen onConnect={() => setAppState('main')} />
        </View>
      )}

      {/* Main app with bottom tabs */}
      {appState === 'main' && (
        <View style={{ flex: 1 }}>
          {/* Tab content */}
          <View style={{ flex: 1 }}>
            {activeTab === 'dashboard' && (
              <DashboardScreen
                onReport={() => setActiveTab('report')}
                tier={tier}
              />
            )}
            {activeTab === 'codes' && (
              <DTCScreen tier={tier} />
            )}
            {activeTab === 'report' && (
              <ConditionReportScreen
                onBack={() => setActiveTab('dashboard')}
                tier={tier}
              />
            )}
            {activeTab === 'service' && (
              <MaintenanceScreen tier={tier} />
            )}
            {activeTab === 'trip' && (
              <TripComputerScreen tier={tier} />
            )}
            {activeTab === 'history' && (
              <ScanHistoryScreen tier={tier} />
            )}
            {activeTab === 'keys' && (
              <KeyManagementScreen
                tier={tier}
                mode05Purchased={mode05}
              />
            )}
            {activeTab === 'remote' && (
              <RemoteStartScreen
                tier={tier}
                mode06Purchased={mode06}
              />
            )}
            {activeTab === 'settings' && (
              <SettingsScreen
                mechanicMode={mechanicMode}
                onToggleMechanic={setMechanicMode}
                tier={tier}
                mode05Purchased={mode05}
                mode06Purchased={mode06}
              />
            )}
          </View>

          {/* Bottom Tab Bar */}
          <View style={styles.tabBar}>
            {visibleTabs.map((tab) => {
              const isActive = activeTab === tab.id;
              const IconComp = tab.icon;
              return (
                <TouchableOpacity
                  key={tab.id}
                  style={styles.tabItem}
                  onPress={() => setActiveTab(tab.id)}
                  activeOpacity={0.7}
                >
                  <IconComp
                    size={20}
                    color={isActive ? COLORS.cyan : COLORS.textDim}
                  />
                  <Text style={[styles.tabLabel, isActive && styles.tabLabelActive]}>
                    {tab.label}
                  </Text>
                  {isActive && <View style={styles.tabIndicator} />}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bgDark },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32, backgroundColor: COLORS.bgDark },
  checkingText: { color: 'rgba(255,255,255,0.5)', fontSize: 14, marginTop: 16 },
  lockIcon: { fontSize: 48, marginBottom: 20 },
  lockTitle: { color: '#f0f4f8', fontSize: 22, fontWeight: '800', marginBottom: 12, textAlign: 'center' },
  lockDesc: { color: 'rgba(255,255,255,0.5)', fontSize: 14, lineHeight: 22, textAlign: 'center', marginBottom: 32, maxWidth: 320 },
  refreshBtn: { paddingVertical: 12, paddingHorizontal: 24, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', marginBottom: 12 },
  refreshBtnText: { color: 'rgba(255,255,255,0.5)', fontSize: 13 },
  signOutBtn: { paddingVertical: 8, marginTop: 8 },
  signOutText: { color: 'rgba(255,255,255,0.3)', fontSize: 12 },
  greetingBar: { paddingTop: 56, paddingHorizontal: 24, paddingBottom: 16, backgroundColor: COLORS.bgDark, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)' },
  greetingText: { color: 'rgba(255,255,255,0.6)', fontSize: 18, fontWeight: '500' },
  greetingName: { color: '#10b981', fontWeight: '800' },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: COLORS.bgPanel,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
    paddingBottom: 28, // safe area
    paddingTop: 8,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
    position: 'relative',
  },
  tabLabel: {
    color: COLORS.textDim,
    fontSize: 10,
    fontWeight: '600',
    marginTop: 3,
    letterSpacing: 0.3,
  },
  tabLabelActive: {
    color: COLORS.cyan,
  },
  tabIndicator: {
    position: 'absolute',
    top: 0,
    width: 20,
    height: 2,
    borderRadius: 1,
    backgroundColor: COLORS.cyan,
  },
});
