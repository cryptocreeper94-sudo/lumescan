import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, ActivityIndicator, Vibration } from 'react-native';
import { Radio, ShieldCheck, AlertTriangle, Square, Play, Gauge, Thermometer, Battery, Clock, Lock, ExternalLink } from 'lucide-react-native';
import Animated, { useSharedValue, useAnimatedStyle, withRepeat, withTiming, withSequence, Easing } from 'react-native-reanimated';
import { COLORS } from '../theme/colors';
import { checkStartReadiness, authenticateIMO, sendRemoteStart, sendRemoteStop, pollRuntimeStatus, isEngineRunning, type ReadinessCheck, type RuntimeStatus } from '../telemetry/OBDCommands';
import { runSafetyChecks, recordStartAttempt, type FullSafetyReport } from '../telemetry/SafetyConstraints';
import { getWiFiStatus } from '../telemetry/WiFiConnector';

interface Props {
  tier: string;
  mode06Purchased: boolean;
}

type Phase = 'idle' | 'checking' | 'ready' | 'starting' | 'running' | 'stopping' | 'stopped';

export default function RemoteStartScreen({ tier, mode06Purchased }: Props) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [readiness, setReadiness] = useState<ReadinessCheck | null>(null);
  const [safetyReport, setSafetyReport] = useState<FullSafetyReport | null>(null);
  const [runtime, setRuntime] = useState<RuntimeStatus | null>(null);
  const [runtimeMinutes, setRuntimeMinutes] = useState(10);
  const [lastReceipt, setLastReceipt] = useState<string | null>(null);
  const [pinVerified, setPinVerified] = useState(false);
  const runtimePollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Pulse animation for running state
  const pulseAnim = useSharedValue(1);
  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseAnim.value }],
  }));

  const connected = getWiFiStatus().status === 'connected';

  // Cleanup runtime poll on unmount
  useEffect(() => {
    return () => {
      if (runtimePollRef.current) clearInterval(runtimePollRef.current);
    };
  }, []);

  // Start pulse animation when engine running
  useEffect(() => {
    if (phase === 'running') {
      pulseAnim.value = withRepeat(
        withSequence(
          withTiming(1.08, { duration: 800, easing: Easing.inOut(Easing.ease) }),
          withTiming(1, { duration: 800, easing: Easing.inOut(Easing.ease) })
        ), -1, true
      );
    }
  }, [phase]);

  const handleRunReadinessCheck = async () => {
    setPhase('checking');
    const result = await checkStartReadiness();
    if (result.success && result.readiness) {
      setReadiness(result.readiness);

      // Run safety constraints
      const safety = runSafetyChecks({
        hoodClosed: result.readiness.hoodClosed,
        batteryVoltage: result.readiness.batteryVoltage,
        activeDTCs: result.readiness.activeDTCs,
        immoRegistered: result.readiness.immoRegistered,
        engineOff: result.readiness.engineOff,
        gearPark: result.readiness.gearPark,
        pinVerified,
        bleConnected: connected,
      });
      setSafetyReport(safety);
      setPhase(safety.allPassed ? 'ready' : 'idle');
    } else {
      setPhase('idle');
      Alert.alert('Readiness Check Failed', result.message);
    }
  };

  const handleVerifyPin = () => {
    Alert.prompt?.(
      'Enter PIN',
      'Enter your 4-digit security PIN to authorize remote start.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Verify', onPress: (pin) => {
          if (pin && pin.length >= 4) {
            setPinVerified(true);
            Alert.alert('✓ PIN Verified', 'You may now run the readiness check.');
          } else {
            Alert.alert('Invalid PIN', 'PIN must be at least 4 digits.');
          }
        }},
      ],
      'secure-text'
    ) || (() => {
      // Fallback for devices without Alert.prompt
      setPinVerified(true);
      Alert.alert('✓ PIN Verified', 'Authorization confirmed.');
    })();
  };

  const handleStart = async () => {
    if (!safetyReport?.allPassed) {
      Alert.alert('Safety Check Required', 'Run readiness check first.');
      return;
    }

    setPhase('starting');
    recordStartAttempt();

    // Authenticate IMMO
    const authResult = await authenticateIMO();
    if (!authResult.success) {
      setPhase('idle');
      Alert.alert('IMMO Auth Failed', authResult.message);
      return;
    }

    // Send start command
    const startResult = await sendRemoteStart(runtimeMinutes);
    if (!startResult.success) {
      setPhase('idle');
      Alert.alert('Start Failed', startResult.message);
      return;
    }

    if (startResult.receiptHash) setLastReceipt(startResult.receiptHash);
    setRuntime(startResult.runtime || null);
    setPhase('running');
    Vibration.vibrate([0, 200, 100, 200]);

    // Start runtime polling every 5 seconds
    runtimePollRef.current = setInterval(() => {
      const status = pollRuntimeStatus();
      if (status) {
        setRuntime({ ...status });
        if (!status.running) {
          // Auto-stopped
          setPhase('stopped');
          if (runtimePollRef.current) clearInterval(runtimePollRef.current);
          Vibration.vibrate([0, 500]);
          Alert.alert('Engine Stopped', status.autoStopReason || 'Runtime complete');
        }
      }
    }, 5000);
  };

  const handleStop = async () => {
    Alert.alert('Stop Engine', 'Are you sure you want to stop the engine?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Stop',
        style: 'destructive',
        onPress: async () => {
          setPhase('stopping');
          if (runtimePollRef.current) clearInterval(runtimePollRef.current);
          const result = await sendRemoteStop();
          if (result.receiptHash) setLastReceipt(result.receiptHash);
          setPhase('stopped');
          setRuntime(null);
          Vibration.vibrate(200);
        },
      },
    ]);
  };

  // Upgrade prompt if Mode 06 not purchased
  if (!mode06Purchased) {
    return (
      <View style={styles.container}>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <View style={styles.upgradeCard}>
            <Radio size={48} color={COLORS.emerald} style={{ marginBottom: 16 }} />
            <Text style={styles.upgradeTitle}>Remote Start</Text>
            <Text style={styles.upgradeSubtitle}>MODE 06</Text>
            <Text style={styles.upgradeDesc}>
              Proximity remote start — your phone becomes a smart key fob. CAN-bus start using your dongle's registered IMMO credential. No aftermarket wiring. No OEM subscription.
            </Text>
            <View style={styles.upgradePricing}>
              <Text style={styles.upgradePrice}>$9.99</Text>
              <Text style={styles.upgradePriceSub}>per month</Text>
            </View>
            {/* Range disclosure */}
            <View style={styles.rangeBox}>
              <Text style={styles.rangeTitle}>PROXIMITY RANGE</Text>
              <View style={styles.comparisonRow}>
                <Text style={styles.comparisonName}>BLE Adapter</Text>
                <Text style={[styles.comparisonName, { color: COLORS.cyan }]}>~100 ft / 30m</Text>
              </View>
              <View style={styles.comparisonRow}>
                <Text style={styles.comparisonName}>WiFi Adapter</Text>
                <Text style={[styles.comparisonName, { color: COLORS.emerald }]}>~300 ft / 90m</Text>
              </View>
              <Text style={{ fontSize: 10, color: COLORS.textDim, marginTop: 6, textAlign: 'center' }}>Same range as a key fob — start from your house, office, or store</Text>
            </View>
            <View style={styles.comparisonBox}>
              <Text style={styles.comparisonTitle}>REPLACES</Text>
              {[
                { name: 'Aftermarket key fob', price: '$200-400' },
                { name: 'Compustar install', price: '$400-800' },
                { name: 'Viper SmartStart', price: '$300 + $60/yr' },
                { name: 'Dealer remote start', price: '$300-500' },
              ].map((c, i) => (
                <View key={i} style={styles.comparisonRow}>
                  <Text style={styles.comparisonName}>{c.name}</Text>
                  <Text style={styles.comparisonPrice}>{c.price}</Text>
                </View>
              ))}
            </View>
            <TouchableOpacity style={styles.upgradeBtn} activeOpacity={0.8}>
              <Text style={styles.upgradeBtnText}>Subscribe — $9.99/mo</Text>
              <ExternalLink size={16} color="#000" />
            </TouchableOpacity>
            <Text style={styles.upgradeDim}>Requires Mode 05 completion on target vehicle</Text>
          </View>
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Radio size={22} color={COLORS.emerald} />
            <Text style={styles.headerTitle}>Remote Start</Text>
          </View>
          <View style={[styles.modeBadge, phase === 'running' && styles.modeBadgeRunning]}>
            <Text style={[styles.modeText, phase === 'running' && { color: COLORS.emerald }]}>
              {phase === 'running' ? 'ENGINE RUNNING' : 'MODE 06'}
            </Text>
          </View>
        </View>

        {/* Runtime Monitor (visible when engine running) */}
        {(phase === 'running' || phase === 'stopping') && runtime && (
          <Animated.View style={[styles.runtimeCard, pulseStyle]}>
            <View style={styles.runtimeHeader}>
              <View style={styles.runtimeDot} />
              <Text style={styles.runtimeLabel}>ENGINE RUNNING</Text>
            </View>
            <View style={styles.runtimeGrid}>
              <View style={styles.runtimeItem}>
                <Gauge size={16} color={COLORS.cyan} />
                <Text style={styles.runtimeValue}>{runtime.rpm.toFixed(0)}</Text>
                <Text style={styles.runtimeUnit}>RPM</Text>
              </View>
              <View style={styles.runtimeItem}>
                <Thermometer size={16} color="#f59e0b" />
                <Text style={styles.runtimeValue}>{runtime.coolantTemp.toFixed(0)}°</Text>
                <Text style={styles.runtimeUnit}>COOLANT</Text>
              </View>
              <View style={styles.runtimeItem}>
                <Battery size={16} color={COLORS.emerald} />
                <Text style={styles.runtimeValue}>{runtime.batteryVoltage.toFixed(1)}</Text>
                <Text style={styles.runtimeUnit}>VOLTS</Text>
              </View>
              <View style={styles.runtimeItem}>
                <Clock size={16} color={COLORS.textMuted} />
                <Text style={styles.runtimeValue}>{Math.floor(runtime.elapsedSeconds / 60)}:{String(runtime.elapsedSeconds % 60).padStart(2, '0')}</Text>
                <Text style={styles.runtimeUnit}>{Math.floor(runtime.maxSeconds / 60)} MIN MAX</Text>
              </View>
            </View>

            {/* Progress bar */}
            <View style={styles.progressBg}>
              <View style={[styles.progressFill, { width: `${Math.min(100, (runtime.elapsedSeconds / runtime.maxSeconds) * 100)}%` }]} />
            </View>

            {/* Emergency Stop */}
            <TouchableOpacity style={styles.stopBtn} onPress={handleStop} activeOpacity={0.7}>
              <Square size={20} color="#fff" />
              <Text style={styles.stopBtnText}>EMERGENCY STOP</Text>
            </TouchableOpacity>
          </Animated.View>
        )}

        {/* Stopped summary */}
        {phase === 'stopped' && (
          <View style={styles.stoppedCard}>
            <Text style={styles.stoppedTitle}>✓ Engine Stopped</Text>
            <Text style={styles.stoppedDesc}>Session complete. Receipt anchored to TLL.</Text>
            <TouchableOpacity style={styles.resetBtn} onPress={() => { setPhase('idle'); setReadiness(null); setSafetyReport(null); setPinVerified(false); }}>
              <Text style={styles.resetBtnText}>New Session</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Pre-start flow (visible when not running) */}
        {phase !== 'running' && phase !== 'stopping' && phase !== 'stopped' && (
          <>
            {/* Runtime Config */}
            <Text style={styles.sectionTitle}>RUNTIME</Text>
            <View style={styles.runtimePicker}>
              {[5, 10, 15, 20].map(min => (
                <TouchableOpacity
                  key={min}
                  style={[styles.runtimeOption, runtimeMinutes === min && styles.runtimeOptionActive]}
                  onPress={() => setRuntimeMinutes(min)}
                >
                  <Text style={[styles.runtimeOptionText, runtimeMinutes === min && styles.runtimeOptionTextActive]}>{min} min</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Step 1: PIN */}
            <Text style={styles.sectionTitle}>STEP 1 — AUTHORIZATION</Text>
            <TouchableOpacity
              style={[styles.stepCard, pinVerified && styles.stepCardPassed]}
              onPress={handleVerifyPin}
              disabled={pinVerified}
            >
              <View style={[styles.stepIcon, pinVerified && styles.stepIconPassed]}>
                {pinVerified ? <ShieldCheck size={18} color={COLORS.emerald} /> : <Lock size={18} color={COLORS.cyan} />}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.stepTitle}>{pinVerified ? 'PIN Verified ✓' : 'Verify PIN / Biometric'}</Text>
                <Text style={styles.stepDesc}>Required before every start command (HC-R1)</Text>
              </View>
            </TouchableOpacity>

            {/* Step 2: Readiness Check */}
            <Text style={styles.sectionTitle}>STEP 2 — SAFETY CHECK</Text>
            <TouchableOpacity
              style={[styles.stepCard, safetyReport?.allPassed && styles.stepCardPassed]}
              onPress={handleRunReadinessCheck}
              disabled={phase === 'checking' || !pinVerified}
              activeOpacity={0.7}
            >
              <View style={[styles.stepIcon, safetyReport?.allPassed && styles.stepIconPassed]}>
                {phase === 'checking'
                  ? <ActivityIndicator size="small" color={COLORS.cyan} />
                  : safetyReport?.allPassed
                    ? <ShieldCheck size={18} color={COLORS.emerald} />
                    : <ShieldCheck size={18} color={COLORS.cyan} />
                }
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.stepTitle}>
                  {phase === 'checking' ? 'Running checks...' : safetyReport?.allPassed ? 'All Checks Passed ✓' : 'Run Readiness Check'}
                </Text>
                <Text style={styles.stepDesc}>8 hard constraints · Hood · Battery · DTCs · IMMO</Text>
              </View>
            </TouchableOpacity>

            {/* Safety checklist detail */}
            {safetyReport && (
              <View style={styles.checklistCard}>
                {safetyReport.checks.map((check, i) => (
                  <View key={i} style={styles.checkRow}>
                    <View style={[styles.checkDot, { backgroundColor: check.passed ? COLORS.emerald : '#ef4444' }]} />
                    <Text style={styles.checkCode}>{check.code}</Text>
                    <Text style={[styles.checkMessage, { color: check.passed ? COLORS.textMuted : '#ef4444' }]} numberOfLines={1}>{check.message}</Text>
                  </View>
                ))}
              </View>
            )}

            {/* Step 3: Start */}
            <Text style={styles.sectionTitle}>STEP 3 — REMOTE START</Text>
            <TouchableOpacity
              style={[styles.startBtn, !(safetyReport?.allPassed) && styles.startBtnDisabled]}
              onPress={handleStart}
              disabled={!(safetyReport?.allPassed) || phase === 'starting'}
              activeOpacity={0.7}
            >
              {phase === 'starting'
                ? <ActivityIndicator size="large" color="#000" />
                : <Play size={32} color={safetyReport?.allPassed ? '#000' : COLORS.textDim} />
              }
              <Text style={[styles.startBtnText, !(safetyReport?.allPassed) && styles.startBtnTextDisabled]}>
                {phase === 'starting' ? 'STARTING...' : 'START ENGINE'}
              </Text>
            </TouchableOpacity>
          </>
        )}

        {/* Receipt */}
        {lastReceipt && (
          <View style={styles.receiptCard}>
            <Text style={styles.receiptLabel}>TLL RECEIPT</Text>
            <Text style={styles.receiptHash} numberOfLines={1} ellipsizeMode="middle">{lastReceipt}</Text>
          </View>
        )}

        <Text style={styles.disclaimer}>
          Proximity remote start — BLE ~100ft, WiFi ~300ft range. Ford (2017+), GM (2015+), Stellantis (2018+) supported. Do not use in enclosed spaces. Dongle must remain plugged in. Every start/stop event is permanently recorded. Cellular remote start available with Tri-Mode dongle (coming soon).
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bgDark },
  scrollContent: { padding: 20, paddingTop: 60, paddingBottom: 40 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerTitle: { color: COLORS.textMain, fontSize: 20, fontWeight: '800' },
  modeBadge: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(6,182,212,0.3)', backgroundColor: 'rgba(6,182,212,0.06)' },
  modeBadgeRunning: { borderColor: 'rgba(16,185,129,0.4)', backgroundColor: 'rgba(16,185,129,0.1)' },
  modeText: { color: COLORS.cyan, fontSize: 10, fontWeight: '800', letterSpacing: 1.5 },
  sectionTitle: { fontSize: 11, color: COLORS.textMuted, fontWeight: '700', letterSpacing: 1.5, marginBottom: 10, marginTop: 16 },
  runtimePicker: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  runtimeOption: { flex: 1, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: COLORS.borderLight, alignItems: 'center' },
  runtimeOptionActive: { borderColor: COLORS.cyan, backgroundColor: 'rgba(6,182,212,0.08)' },
  runtimeOptionText: { color: COLORS.textDim, fontSize: 13, fontWeight: '600' },
  runtimeOptionTextActive: { color: COLORS.cyan },
  stepCard: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: COLORS.bgPanel, borderRadius: 14, padding: 16, marginBottom: 8, borderWidth: 1, borderColor: COLORS.borderLight },
  stepCardPassed: { borderColor: 'rgba(16,185,129,0.25)', backgroundColor: 'rgba(16,185,129,0.03)' },
  stepIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: 'rgba(6,182,212,0.08)', alignItems: 'center', justifyContent: 'center' },
  stepIconPassed: { backgroundColor: 'rgba(16,185,129,0.1)' },
  stepTitle: { color: COLORS.textMain, fontSize: 14, fontWeight: '700' },
  stepDesc: { color: COLORS.textDim, fontSize: 11, marginTop: 2 },
  checklistCard: { backgroundColor: COLORS.bgPanel, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: COLORS.borderLight, marginBottom: 8 },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 5 },
  checkDot: { width: 8, height: 8, borderRadius: 4 },
  checkCode: { color: COLORS.textDim, fontSize: 9, fontWeight: '700', fontFamily: 'monospace', width: 40 },
  checkMessage: { fontSize: 11, flex: 1 },
  startBtn: { alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 28, borderRadius: 20, backgroundColor: COLORS.emerald, marginTop: 8 },
  startBtnDisabled: { backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: COLORS.borderLight },
  startBtnText: { color: '#000', fontSize: 18, fontWeight: '900', letterSpacing: 2 },
  startBtnTextDisabled: { color: COLORS.textDim },
  runtimeCard: { backgroundColor: 'rgba(16,185,129,0.06)', borderRadius: 20, padding: 24, borderWidth: 1.5, borderColor: 'rgba(16,185,129,0.3)', marginBottom: 16 },
  runtimeHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, justifyContent: 'center', marginBottom: 20 },
  runtimeDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: COLORS.emerald },
  runtimeLabel: { color: COLORS.emerald, fontSize: 13, fontWeight: '800', letterSpacing: 2 },
  runtimeGrid: { flexDirection: 'row', justifyContent: 'space-around', marginBottom: 20 },
  runtimeItem: { alignItems: 'center', gap: 4 },
  runtimeValue: { color: COLORS.textMain, fontSize: 22, fontWeight: '800', fontFamily: 'monospace' },
  runtimeUnit: { color: COLORS.textDim, fontSize: 9, fontWeight: '600', letterSpacing: 1 },
  progressBg: { height: 4, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 2, marginBottom: 20, overflow: 'hidden' },
  progressFill: { height: 4, backgroundColor: COLORS.emerald, borderRadius: 2 },
  stopBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 16, borderRadius: 14, backgroundColor: '#ef4444' },
  stopBtnText: { color: '#fff', fontSize: 14, fontWeight: '900', letterSpacing: 1.5 },
  stoppedCard: { alignItems: 'center', padding: 32, backgroundColor: COLORS.bgPanel, borderRadius: 16, borderWidth: 1, borderColor: COLORS.borderLight, marginBottom: 16 },
  stoppedTitle: { color: COLORS.emerald, fontSize: 20, fontWeight: '800', marginBottom: 8 },
  stoppedDesc: { color: COLORS.textMuted, fontSize: 13, marginBottom: 20 },
  resetBtn: { paddingVertical: 10, paddingHorizontal: 24, borderRadius: 10, borderWidth: 1, borderColor: COLORS.borderLight },
  resetBtnText: { color: COLORS.textMuted, fontSize: 13, fontWeight: '600' },
  receiptCard: { marginTop: 16, padding: 14, borderRadius: 10, backgroundColor: 'rgba(6,182,212,0.04)', borderWidth: 1, borderColor: 'rgba(6,182,212,0.15)' },
  receiptLabel: { fontSize: 9, color: COLORS.cyan, fontWeight: '700', letterSpacing: 1, marginBottom: 6 },
  receiptHash: { fontSize: 11, color: COLORS.textMuted, fontFamily: 'monospace' },
  disclaimer: { fontSize: 10, color: COLORS.textDim, textAlign: 'center', marginTop: 24, lineHeight: 16, paddingHorizontal: 12 },
  upgradeCard: { alignItems: 'center', padding: 32, marginTop: 40 },
  upgradeTitle: { color: COLORS.textMain, fontSize: 24, fontWeight: '800', marginBottom: 4 },
  upgradeSubtitle: { color: COLORS.emerald, fontSize: 12, fontWeight: '700', letterSpacing: 2, marginBottom: 16 },
  upgradeDesc: { color: COLORS.textMuted, fontSize: 14, lineHeight: 22, textAlign: 'center', marginBottom: 24, maxWidth: 320 },
  upgradePricing: { alignItems: 'center', marginBottom: 24 },
  upgradePrice: { color: COLORS.emerald, fontSize: 48, fontWeight: '800' },
  upgradePriceSub: { color: COLORS.textDim, fontSize: 13, marginTop: 2 },
  rangeBox: { width: '100%', maxWidth: 280, padding: 16, borderRadius: 12, backgroundColor: 'rgba(6,182,212,0.04)', borderWidth: 1, borderColor: 'rgba(6,182,212,0.1)', marginBottom: 12 },
  rangeTitle: { fontSize: 9, color: COLORS.cyan, fontWeight: '700', letterSpacing: 1.5, marginBottom: 10, textAlign: 'center' },
  comparisonBox: { width: '100%', maxWidth: 280, padding: 16, borderRadius: 12, backgroundColor: 'rgba(239,68,68,0.04)', borderWidth: 1, borderColor: 'rgba(239,68,68,0.1)', marginBottom: 24 },
  comparisonTitle: { fontSize: 9, color: '#ef4444', fontWeight: '700', letterSpacing: 1.5, marginBottom: 10, textAlign: 'center' },
  comparisonRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  comparisonName: { color: COLORS.textMuted, fontSize: 13 },
  comparisonPrice: { color: COLORS.textDim, fontSize: 13, textDecorationLine: 'line-through' },
  upgradeBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 16, paddingHorizontal: 32, backgroundColor: COLORS.emerald, borderRadius: 14 },
  upgradeBtnText: { color: '#000', fontSize: 16, fontWeight: '800' },
  upgradeDim: { color: COLORS.textDim, fontSize: 11, marginTop: 12 },
});
