import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, SafeAreaView, TouchableOpacity, Alert, Dimensions, TextInput } from 'react-native';
import { Wifi, Bluetooth, Activity, ChevronRight, Zap, Radio } from 'lucide-react-native';
import { COLORS } from '../theme/colors';
import Animated, {
  useSharedValue, useAnimatedStyle, withRepeat, withTiming,
  Easing, withSequence, withDelay, FadeIn
} from 'react-native-reanimated';
import { probeForAdapter, WiFiConnection, enterDemoMode } from '../telemetry/WiFiConnector';

const { width } = Dimensions.get('window');

export default function ConnectionScreen({ onConnect }: { onConnect: () => void }) {
  const [status, setStatus] = useState<WiFiConnection>({
    status: 'disconnected', host: null, error: null, isSimulated: false, adapterInfo: null,
  });
  const [scanning, setScanning] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [customIP, setCustomIP] = useState('192.168.0.10');

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

  async function handleConnect() {
    setScanning(true);
    const found = await probeForAdapter(setStatus);
    if (found) {
      setTimeout(onConnect, 800);
    } else {
      Alert.alert(
        'No Adapter Found',
        'Make sure your phone is connected to the adapter\'s WiFi hotspot (usually named "WiFi_OBDII" or "OBDLink"), then try again.\n\nOr try Demo Mode to explore with simulated data.',
        [
          { text: 'Try Again', onPress: () => setScanning(false) },
          { text: 'Custom IP', onPress: () => { setScanning(false); setShowAdvanced(true); } },
          { text: 'Demo Mode', onPress: handleDemoMode },
        ]
      );
    }
    setScanning(false);
  }

  async function handleCustomConnect() {
    setScanning(true);
    const found = await probeForAdapter(setStatus, customIP);
    if (found) {
      setTimeout(onConnect, 800);
    } else {
      Alert.alert('Connection Failed', `Could not reach adapter at ${customIP}:35000`);
    }
    setScanning(false);
  }

  function handleDemoMode() {
    enterDemoMode(setStatus);
    setTimeout(onConnect, 500);
  }

  const statusText: Record<string, string> = {
    disconnected: 'Ready to connect',
    probing: 'Scanning network...',
    connecting: `Connecting to ${status.host}...`,
    initializing: 'Initializing ELM327...',
    connected: status.adapterInfo || `Connected: ${status.host}`,
    error: status.error || 'Connection error',
  };

  const statusColor: Record<string, string> = {
    disconnected: COLORS.textMuted,
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
            <Wifi size={32} color={COLORS.cyan} />
          </Animated.View>
        </View>

        {/* Status */}
        <Text style={[styles.statusText, { color: statusColor[status.status] }]}>
          {statusText[status.status]}
        </Text>

        {/* Buttons */}
        <View style={styles.buttonContainer}>
          <TouchableOpacity
            style={[styles.primaryBtn, scanning && styles.primaryBtnDisabled]}
            onPress={handleConnect}
            disabled={scanning}
          >
            <Wifi size={20} color="#000" />
            <Text style={styles.primaryBtnText}>
              {scanning ? 'CONNECTING...' : 'CONNECT VIA WIFI'}
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

          <TouchableOpacity style={styles.secondaryBtn} onPress={handleDemoMode}>
            <Zap size={18} color={COLORS.cyan} />
            <Text style={styles.secondaryBtnText}>DEMO MODE</Text>
            <Text style={styles.secondaryBtnSub}>Simulated 2019 F-150 · No adapter needed</Text>
          </TouchableOpacity>
        </View>

        {/* Quick Setup */}
        <View style={styles.infoContainer}>
          <Text style={styles.infoTitle}>QUICK SETUP</Text>
          {[
            '1. Plug WiFi OBD-II adapter into your car',
            '2. Connect phone to adapter\'s WiFi hotspot',
            '3. Come back here and tap "Connect via WiFi"',
          ].map((step, i) => (
            <View key={i} style={styles.infoRow}>
              <ChevronRight size={12} color={COLORS.cyan} />
              <Text style={styles.infoText}>{step}</Text>
            </View>
          ))}
        </View>

        {/* Compatible */}
        <View style={styles.compatContainer}>
          <Text style={styles.compatTitle}>COMPATIBLE ADAPTERS</Text>
          <Text style={styles.compatText}>
            Any WiFi ELM327 · OBDLink MX WiFi · Veepeak · BAFX WiFi{'\n'}
            Also supports Bluetooth (BLE) with development build
          </Text>
        </View>

        {/* Patent */}
        <Text style={styles.patent}>
          42 Nodes · 4 Primitives · Zero AI · US Patent 64/032,339
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bgDark },
  content: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  header: { alignItems: 'center', marginBottom: 24 },
  logoRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  logoText: { color: COLORS.textMain, fontSize: 28, fontWeight: '800', letterSpacing: 2 },
  logoSub: { color: COLORS.textMuted, fontWeight: '400' },
  tagline: { color: COLORS.textDim, fontSize: 12, letterSpacing: 1.5, textTransform: 'uppercase' },
  radarContainer: { width: 320, height: 320, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  radarCore: {
    width: 76, height: 76, borderRadius: 38,
    backgroundColor: 'rgba(6, 182, 212, 0.1)',
    borderWidth: 2, borderColor: COLORS.cyan,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: COLORS.cyan, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.8, shadowRadius: 20,
  },
  statusText: { fontSize: 12, fontWeight: '600', letterSpacing: 1, marginBottom: 24, textTransform: 'uppercase' },
  buttonContainer: { width: '100%', gap: 12, marginBottom: 24 },
  primaryBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    backgroundColor: COLORS.cyan, borderRadius: 30, paddingVertical: 16,
  },
  primaryBtnDisabled: { opacity: 0.5 },
  primaryBtnText: { color: '#000', fontSize: 14, fontWeight: '800', letterSpacing: 1.5 },
  advancedRow: { flexDirection: 'row', gap: 8 },
  ipInput: {
    flex: 1, backgroundColor: COLORS.bgPanel, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12,
    color: COLORS.textMain, fontFamily: 'monospace', fontSize: 14,
    borderWidth: 1, borderColor: COLORS.borderLight,
  },
  ipConnectBtn: {
    backgroundColor: COLORS.cyan, borderRadius: 12, paddingHorizontal: 20, justifyContent: 'center',
  },
  ipConnectText: { color: '#000', fontWeight: '800', fontSize: 14 },
  secondaryBtn: {
    alignItems: 'center', gap: 4,
    borderWidth: 1, borderColor: COLORS.borderLight, borderRadius: 16, paddingVertical: 14,
    backgroundColor: COLORS.bgPanel,
  },
  secondaryBtnText: { color: COLORS.cyan, fontSize: 12, fontWeight: '700', letterSpacing: 1 },
  secondaryBtnSub: { color: COLORS.textDim, fontSize: 10 },
  infoContainer: { alignSelf: 'flex-start', marginBottom: 16 },
  infoTitle: { color: COLORS.textDim, fontSize: 10, fontWeight: '700', letterSpacing: 1.5, marginBottom: 8 },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  infoText: { color: COLORS.textMuted, fontSize: 11 },
  compatContainer: { marginBottom: 16 },
  compatTitle: { color: COLORS.textDim, fontSize: 10, fontWeight: '700', letterSpacing: 1.5, marginBottom: 4, textAlign: 'center' },
  compatText: { color: COLORS.textDim, fontSize: 10, textAlign: 'center', lineHeight: 16 },
  patent: { color: COLORS.textDim, fontSize: 10, textAlign: 'center', lineHeight: 16 },
});
