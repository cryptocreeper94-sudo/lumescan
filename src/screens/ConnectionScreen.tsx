import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, SafeAreaView, TouchableOpacity, Platform, Alert, Dimensions } from 'react-native';
import { Bluetooth, Wifi, Activity, ChevronRight, Zap, Radio } from 'lucide-react-native';
import { COLORS } from '../theme/colors';
import Animated, {
  useSharedValue, useAnimatedStyle, withRepeat, withTiming,
  Easing, withSequence, withDelay, FadeIn
} from 'react-native-reanimated';
import { scanForDevices, connectToDevice, OBDConnection, startTelemetryLoop } from '../telemetry/OBDConnector';

const { width } = Dimensions.get('window');

export default function ConnectionScreen({ onConnect }: { onConnect: () => void }) {
  const [status, setStatus] = useState<OBDConnection>({
    status: 'disconnected', deviceName: null, error: null, isSimulated: false,
  });
  const [scanning, setScanning] = useState(false);

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

  const ring1Style = makeRingStyle(ring1, 220);
  const ring2Style = makeRingStyle(ring2, 280);
  const ring3Style = makeRingStyle(ring3, 340);

  async function handleScan() {
    setScanning(true);
    try {
      const device = await scanForDevices(setStatus, 8000);
      if (device) {
        const success = await connectToDevice(device, setStatus);
        if (success) {
          // Connected to real adapter!
          setTimeout(onConnect, 1000);
          return;
        }
      }
      // No device found — offer demo mode
      Alert.alert(
        'No Adapter Found',
        'No ELM327 adapter detected nearby. Would you like to try Demo Mode with simulated vehicle data?',
        [
          { text: 'Cancel', style: 'cancel', onPress: () => setScanning(false) },
          {
            text: 'Demo Mode',
            onPress: () => {
              setStatus({ status: 'connected', deviceName: 'SIMULATED', error: null, isSimulated: true });
              setTimeout(onConnect, 500);
            }
          },
        ]
      );
    } catch (err: any) {
      setStatus({ status: 'error', deviceName: null, error: err.message, isSimulated: false });
    }
    setScanning(false);
  }

  function handleDemoMode() {
    setStatus({ status: 'connected', deviceName: 'DEMO MODE', error: null, isSimulated: true });
    setTimeout(onConnect, 500);
  }

  const statusText = {
    disconnected: 'Ready to scan',
    scanning: 'Scanning for ELM327...',
    connecting: `Connecting to ${status.deviceName}...`,
    initializing: 'Initializing protocol...',
    connected: `Connected: ${status.deviceName}`,
    error: status.error || 'Connection error',
  }[status.status];

  const statusColor = {
    disconnected: COLORS.textMuted,
    scanning: COLORS.cyan,
    connecting: COLORS.cyan,
    initializing: '#f59e0b',
    connected: COLORS.emerald,
    error: '#ef4444',
  }[status.status];

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
            <Bluetooth size={32} color={COLORS.cyan} />
          </Animated.View>
        </View>

        {/* Status */}
        <Text style={[styles.statusText, { color: statusColor }]}>{statusText}</Text>

        {/* Buttons */}
        <View style={styles.buttonContainer}>
          <TouchableOpacity
            style={[styles.primaryBtn, scanning && styles.primaryBtnDisabled]}
            onPress={handleScan}
            disabled={scanning}
          >
            <Radio size={20} color="#000" />
            <Text style={styles.primaryBtnText}>
              {scanning ? 'SCANNING...' : 'SCAN FOR ADAPTER'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.secondaryBtn} onPress={handleDemoMode}>
            <Zap size={18} color={COLORS.cyan} />
            <Text style={styles.secondaryBtnText}>DEMO MODE</Text>
            <Text style={styles.secondaryBtnSub}>Simulated 2019 F-150 telemetry</Text>
          </TouchableOpacity>
        </View>

        {/* Info */}
        <View style={styles.infoContainer}>
          <Text style={styles.infoTitle}>COMPATIBLE ADAPTERS</Text>
          {['BAFX Products (BLE)', 'OBDLink MX+ / LX', 'Veepeak OBDCheck', 'Any BLE ELM327 v2.1+'].map((name, i) => (
            <View key={i} style={styles.infoRow}>
              <ChevronRight size={12} color={COLORS.cyan} />
              <Text style={styles.infoText}>{name}</Text>
            </View>
          ))}
        </View>

        {/* Patent */}
        <Text style={styles.patent}>
          42 Nodes · 4 Primitives · Zero AI{'\n'}
          US Provisional Patent 64/032,339
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bgDark },
  content: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  header: { alignItems: 'center', marginBottom: 32 },
  logoRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  logoText: { color: COLORS.textMain, fontSize: 28, fontWeight: '800', letterSpacing: 2 },
  logoSub: { color: COLORS.textMuted, fontWeight: '400' },
  tagline: { color: COLORS.textDim, fontSize: 12, letterSpacing: 1.5, textTransform: 'uppercase' },
  radarContainer: { width: 340, height: 340, alignItems: 'center', justifyContent: 'center', marginBottom: 24 },
  radarCore: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: 'rgba(6, 182, 212, 0.1)',
    borderWidth: 2, borderColor: COLORS.cyan,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: COLORS.cyan, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.8, shadowRadius: 20,
  },
  statusText: { fontSize: 13, fontWeight: '600', letterSpacing: 1, marginBottom: 32, textTransform: 'uppercase' },
  buttonContainer: { width: '100%', gap: 12, marginBottom: 32 },
  primaryBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    backgroundColor: COLORS.cyan, borderRadius: 30, paddingVertical: 16,
  },
  primaryBtnDisabled: { opacity: 0.5 },
  primaryBtnText: { color: '#000', fontSize: 14, fontWeight: '800', letterSpacing: 1.5 },
  secondaryBtn: {
    alignItems: 'center', gap: 4,
    borderWidth: 1, borderColor: COLORS.borderLight, borderRadius: 16, paddingVertical: 14,
    backgroundColor: COLORS.bgPanel,
  },
  secondaryBtnText: { color: COLORS.cyan, fontSize: 12, fontWeight: '700', letterSpacing: 1 },
  secondaryBtnSub: { color: COLORS.textDim, fontSize: 10 },
  infoContainer: { alignSelf: 'flex-start', marginBottom: 24 },
  infoTitle: { color: COLORS.textDim, fontSize: 10, fontWeight: '700', letterSpacing: 1.5, marginBottom: 8 },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  infoText: { color: COLORS.textMuted, fontSize: 12 },
  patent: { color: COLORS.textDim, fontSize: 10, textAlign: 'center', lineHeight: 16 },
});
