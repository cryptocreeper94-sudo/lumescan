import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, SafeAreaView, TouchableOpacity, Alert, Dimensions, TextInput } from 'react-native';
import { Wifi, Bluetooth, Activity, ChevronRight, Zap } from 'lucide-react-native';
import { COLORS } from '../theme/colors';
import Animated, {
  useSharedValue, useAnimatedStyle, withRepeat, withTiming,
  Easing, withSequence, withDelay, FadeIn
} from 'react-native-reanimated';
import { probeForAdapter, WiFiConnection, enterDemoMode } from '../telemetry/WiFiConnector';
import { connectBLENative, BLEConnection, enterBLEDemoMode } from '../telemetry/BLEConnector';

const { width } = Dimensions.get('window');

type ConnectionMode = 'idle' | 'wifi' | 'ble';

export default function ConnectionScreen({ onConnect }: { onConnect: () => void }) {
  const [wifiStatus, setWifiStatus] = useState<WiFiConnection>({
    status: 'disconnected', host: null, error: null, isSimulated: false, adapterInfo: null,
  });
  const [bleStatus, setBleStatus] = useState<BLEConnection>({
    status: 'disconnected', deviceName: null, error: null, isSimulated: false, adapterInfo: null,
  });
  const [mode, setMode] = useState<ConnectionMode>('idle');
  const [scanning, setScanning] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [customIP, setCustomIP] = useState('192.168.0.10');

  // Active status
  const activeStatus = mode === 'ble' ? bleStatus.status : mode === 'wifi' ? wifiStatus.status : 'disconnected';
  const activeMessage = mode === 'ble'
    ? (bleStatus.adapterInfo || bleStatus.error || bleStatus.deviceName || 'Ready')
    : mode === 'wifi'
    ? (wifiStatus.adapterInfo || wifiStatus.error || wifiStatus.host || 'Ready')
    : 'Select a connection method';

  // Radar animation
  const ring1 = useSharedValue(0);
  const ring2 = useSharedValue(0);
  const ring3 = useSharedValue(0);
  const pulseGlow = useSharedValue(0.3);

  useEffect(() => {
    ring1.value = withRepeat(withTiming(1, { duration: 2500, easing: Easing.out(Easing.ease) }), -1, false);
    ring2.value = withRepeat(withDelay(800, withTiming(1, { duration: 2500, easing: Easing.out(Easing.ease) })), -1, false);
    ring3.value = withRepeat(withDelay(1600, withTiming(1, { duration: 2500, easing: Easing.out(Easing.ease) })), -1, false);
    pulseGlow.value = withRepeat(withSequence(
      withTiming(1, { duration: 1200, easing: Easing.inOut(Easing.ease) }),
      withTiming(0.3, { duration: 1200, easing: Easing.inOut(Easing.ease) }),
    ), -1, true);
  }, []);

  const makeRingStyle = (anim: Animated.SharedValue<number>, size: number) =>
    useAnimatedStyle(() => ({
      position: 'absolute' as const,
      width: size, height: size, borderRadius: size / 2,
      borderWidth: 1.5,
      borderColor: `rgba(6, 182, 212, ${0.6 - anim.value * 0.6})`,
      transform: [{ scale: 0.5 + anim.value * 0.5 }],
      opacity: 1 - anim.value,
    }));

  const glowStyle = useAnimatedStyle(() => ({
    opacity: pulseGlow.value,
  }));

  const ring1Style = makeRingStyle(ring1, 200);
  const ring2Style = makeRingStyle(ring2, 260);
  const ring3Style = makeRingStyle(ring3, 320);

  // WiFi connect
  async function handleWiFiConnect() {
    setMode('wifi');
    setScanning(true);
    const found = await probeForAdapter(setWifiStatus);
    if (found) {
      setTimeout(onConnect, 800);
    } else {
      Alert.alert(
        'No WiFi Adapter Found',
        'Make sure your phone is connected to the adapter\'s WiFi hotspot, then try again.\n\nOr try Bluetooth or Demo Mode.',
        [
          { text: 'Try Again', onPress: () => setScanning(false) },
          { text: 'Custom IP', onPress: () => { setScanning(false); setShowAdvanced(true); } },
          { text: 'Demo Mode', onPress: handleDemoMode },
        ]
      );
    }
    setScanning(false);
  }

  // BLE connect
  async function handleBLEConnect() {
    setMode('ble');
    setScanning(true);
    const found = await connectBLENative(setBleStatus);
    if (found) {
      setTimeout(onConnect, 800);
    } else {
      Alert.alert(
        'No BLE Adapter Found',
        'Make sure your OBD-II adapter is powered on and in range.\n\nOr try WiFi or Demo Mode.',
        [
          { text: 'Try Again', onPress: () => setScanning(false) },
          { text: 'Demo Mode', onPress: handleDemoMode },
        ]
      );
    }
    setScanning(false);
  }

  async function handleCustomConnect() {
    setMode('wifi');
    setScanning(true);
    const found = await probeForAdapter(setWifiStatus, customIP);
    if (found) {
      setTimeout(onConnect, 800);
    } else {
      Alert.alert('Connection Failed', `Could not reach adapter at ${customIP}:35000`);
    }
    setScanning(false);
  }

  function handleDemoMode() {
    enterDemoMode(setWifiStatus);
    setTimeout(onConnect, 500);
  }

  const statusColor: Record<string, string> = {
    disconnected: COLORS.textMuted,
    scanning: COLORS.cyan,
    probing: COLORS.cyan,
    connecting: COLORS.cyan,
    initializing: '#f59e0b',
    connected: COLORS.emerald,
    error: '#ef4444',
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>

        {/* Header */}
        <Animated.View entering={FadeIn.duration(800)} style={styles.header}>
          <View style={styles.logoRow}>
            <Activity size={28} color={COLORS.cyan} />
            <Text style={styles.logoText}>LUME<Text style={styles.logoSub}>AUTO</Text></Text>
          </View>
          <Text style={styles.tagline}>Deterministic Vehicle Governance</Text>
        </Animated.View>

        {/* Radar Scanner */}
        <View style={styles.radarContainer}>
          <Animated.View style={ring3Style} />
          <Animated.View style={ring2Style} />
          <Animated.View style={ring1Style} />
          <Animated.View style={[styles.radarCore, glowStyle]}>
            <Activity size={32} color={COLORS.cyan} />
          </Animated.View>
        </View>

        {/* Status */}
        <Text style={[styles.statusText, { color: statusColor[activeStatus] || COLORS.textMuted }]}>
          {scanning
            ? (mode === 'ble' ? 'Scanning for Bluetooth...' : 'Probing WiFi network...')
            : activeMessage}
        </Text>

        {/* Buttons */}
        <View style={styles.buttonContainer}>
          {/* BLE */}
          <TouchableOpacity
            style={[styles.primaryBtn, scanning && styles.primaryBtnDisabled]}
            onPress={handleBLEConnect}
            disabled={scanning}
          >
            <Bluetooth size={20} color="#000" />
            <Text style={styles.primaryBtnText}>
              {scanning && mode === 'ble' ? 'SCANNING...' : 'CONNECT VIA BLUETOOTH'}
            </Text>
          </TouchableOpacity>

          {/* WiFi */}
          <TouchableOpacity
            style={[styles.wifiBtn, scanning && styles.primaryBtnDisabled]}
            onPress={handleWiFiConnect}
            disabled={scanning}
          >
            <Wifi size={20} color={COLORS.cyan} />
            <Text style={styles.wifiBtnText}>
              {scanning && mode === 'wifi' ? 'SCANNING...' : 'CONNECT VIA WIFI'}
            </Text>
          </TouchableOpacity>

          {showAdvanced && (
            <View style={styles.advancedRow}>
              <TextInput
                style={styles.ipInput}
                value={customIP}
                onChangeText={setCustomIP}
                placeholder="192.168.0.10"
                placeholderTextColor={COLORS.textDim}
                keyboardType="numeric"
              />
              <TouchableOpacity style={styles.ipConnectBtn} onPress={handleCustomConnect}>
                <Text style={styles.ipConnectText}>GO</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Demo */}
          <TouchableOpacity style={styles.secondaryBtn} onPress={handleDemoMode}>
            <Zap size={18} color={COLORS.emerald} />
            <Text style={[styles.secondaryBtnText, { color: COLORS.emerald }]}>DEMO MODE</Text>
            <Text style={styles.secondaryBtnSub}>Simulated 2019 F-150 · No adapter needed</Text>
          </TouchableOpacity>
        </View>

        {/* Quick Setup */}
        <View style={styles.infoContainer}>
          <Text style={styles.infoTitle}>QUICK SETUP</Text>
          {[
            '1. Plug OBD-II adapter into vehicle (below steering)',
            '2. Turn ignition to ACC or RUN',
            '3. Bluetooth: Tap connect — auto-scan for adapters',
            '4. WiFi: Join adapter hotspot first, then tap connect',
          ].map((step, i) => (
            <View key={i} style={styles.infoRow}>
              <ChevronRight size={12} color={COLORS.cyan} />
              <Text style={styles.infoText}>{step}</Text>
            </View>
          ))}
        </View>

        <Text style={styles.compat}>
          BLE: Veepeak BLE · OBDLink MX+ · BAFX BLE{'\n'}
          WiFi: Any ELM327 WiFi · OBDLink MX WiFi{'\n'}
          42 Nodes · 4 Primitives · Zero AI · US Patent 64/032,339
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bgDark },
  content: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  header: { alignItems: 'center', marginBottom: 16 },
  logoRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 4 },
  logoText: { fontSize: 26, fontWeight: '800', color: '#fff', letterSpacing: 3 },
  logoSub: { fontWeight: '400', color: COLORS.textMuted },
  tagline: { fontSize: 11, color: COLORS.textDim, letterSpacing: 3, textTransform: 'uppercase' },
  radarContainer: { width: 240, height: 240, alignItems: 'center', justifyContent: 'center', marginVertical: 16 },
  radarCore: {
    width: 68, height: 68, borderRadius: 34,
    backgroundColor: 'rgba(6,182,212,0.1)', borderWidth: 2, borderColor: COLORS.cyan,
    alignItems: 'center', justifyContent: 'center',
  },
  statusText: { fontSize: 11, fontWeight: '600', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 16 },
  buttonContainer: { width: '100%', gap: 10, marginBottom: 20 },
  primaryBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    backgroundColor: COLORS.cyan, paddingVertical: 14, borderRadius: 30,
  },
  primaryBtnDisabled: { opacity: 0.5 },
  primaryBtnText: { color: '#000', fontSize: 13, fontWeight: '800', letterSpacing: 2 },
  wifiBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    backgroundColor: 'rgba(255,255,255,0.04)', paddingVertical: 14, borderRadius: 30,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
  },
  wifiBtnText: { color: '#fff', fontSize: 13, fontWeight: '700', letterSpacing: 2 },
  advancedRow: { flexDirection: 'row', gap: 8 },
  ipInput: {
    flex: 1, backgroundColor: 'rgba(255,255,255,0.03)', borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)', borderRadius: 12, paddingHorizontal: 16,
    paddingVertical: 12, color: '#fff', fontFamily: 'monospace', fontSize: 15,
  },
  ipConnectBtn: {
    backgroundColor: COLORS.cyan, borderRadius: 12,
    paddingHorizontal: 20, justifyContent: 'center',
  },
  ipConnectText: { color: '#000', fontWeight: '800', fontSize: 14 },
  secondaryBtn: {
    alignItems: 'center', gap: 4, paddingVertical: 14, borderRadius: 16,
    backgroundColor: 'rgba(16,185,129,0.06)', borderWidth: 1, borderColor: 'rgba(16,185,129,0.2)',
  },
  secondaryBtnText: { fontSize: 12, fontWeight: '700', letterSpacing: 2 },
  secondaryBtnSub: { fontSize: 10, color: COLORS.textDim },
  infoContainer: { width: '100%', marginBottom: 12 },
  infoTitle: { fontSize: 10, fontWeight: '700', color: COLORS.textDim, letterSpacing: 3, marginBottom: 6 },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 3 },
  infoText: { fontSize: 11, color: COLORS.textMuted },
  compat: { fontSize: 9, color: COLORS.textDim, textAlign: 'center', lineHeight: 16 },
});
