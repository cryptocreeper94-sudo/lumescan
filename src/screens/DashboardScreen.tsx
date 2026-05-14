import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, SafeAreaView, Dimensions, ScrollView, TouchableOpacity } from 'react-native';
import { Activity, Zap, Droplets, ShieldCheck, Bluetooth, ActivitySquare, FileText } from 'lucide-react-native';
import { COLORS } from '../theme/colors';
import Animated, { useSharedValue, useAnimatedStyle, withRepeat, withTiming, Easing, withSequence } from 'react-native-reanimated';
import { tick, TelemetrySnapshot } from '../telemetry/SimulatedEngine';

const { width } = Dimensions.get('window');

export default function DashboardScreen({ onReport }: { onReport?: () => void }) {
  const [data, setData] = useState<TelemetrySnapshot | null>(null);
  const pulseAnim = useSharedValue(1);

  useEffect(() => {
    pulseAnim.value = withRepeat(
      withSequence(
        withTiming(1.2, { duration: 1000, easing: Easing.inOut(Easing.ease) }),
        withTiming(1, { duration: 1000, easing: Easing.inOut(Easing.ease) })
      ),
      -1, true
    );

    // 100ms telemetry tick — matches real OBD-II polling rate
    const interval = setInterval(() => {
      setData(tick());
    }, 100);
    return () => clearInterval(interval);
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseAnim.value }],
    opacity: pulseAnim.value === 1 ? 0.8 : 1,
  }));

  if (!data) return null;

  const modeColor = data.governanceMode === 'Flow State' ? COLORS.emerald
    : data.governanceMode === 'Throughput Alert' ? '#f59e0b'
    : COLORS.cyan;

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>

        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <ActivitySquare size={24} color={COLORS.cyan} />
            <Text style={styles.headerTitle}>LUME<Text style={styles.headerTitleSub}>AUTO</Text></Text>
          </View>
          <View style={styles.connectionBadge}>
            <Animated.View style={[styles.statusDot, animatedStyle]} />
            <Text style={styles.connectionText}>ELM327 CONNECTED</Text>
          </View>
        </View>

        {/* Mode Badge */}
        <View style={[styles.modeBadge, { borderColor: modeColor }]}>
          <Text style={[styles.modeText, { color: modeColor }]}>{data.governanceMode.toUpperCase()}</Text>
        </View>

        {/* Main Telemetry Ring */}
        <View style={styles.telemetryContainer}>
          <View style={styles.glowRing} />
          <View style={styles.telemetryCenter}>
            <Text style={styles.telemetryValue}>+{data.mpgRecovery.toFixed(1)}%</Text>
            <Text style={styles.telemetryLabel}>MPG RECOVERY</Text>
          </View>
        </View>

        {/* Live Stats Bar */}
        <View style={styles.statsBar}>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{data.tb6_rpm.toFixed(0)}</Text>
            <Text style={styles.statLabel}>RPM</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{(data.tb7_speed * 0.621371).toFixed(0)}</Text>
            <Text style={styles.statLabel}>MPH</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{data.mpgInstant > 0 ? data.mpgInstant.toFixed(1) : '—'}</Text>
            <Text style={styles.statLabel}>MPG</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={[styles.statValue, { color: data.fs10_driverScore > 80 ? COLORS.emerald : '#f59e0b' }]}>
              {data.fs10_driverScore.toFixed(0)}
            </Text>
            <Text style={styles.statLabel}>SCORE</Text>
          </View>
        </View>

        {/* 4/42 Governance Nodes */}
        <Text style={styles.sectionTitle}>GOVERNANCE NODES — 42 ACTIVE</Text>
        <View style={styles.grid}>
          
          {/* Throughput Base */}
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Activity size={16} color={COLORS.cyan} />
              <Text style={styles.cardTitle}>TB — Throughput</Text>
            </View>
            <DataRow label="MAF (TB1)" value={`${data.tb1_maf.toFixed(1)} g/s`} />
            <DataRow label="RPM (TB6)" value={`${data.tb6_rpm.toFixed(0)}`} />
            <DataRow label="Throttle (TB5)" value={`${data.tb5_throttle.toFixed(1)}%`} />
            <DataRow label="Vol.Eff (TB8)" value={`${data.tb8_volEff.toFixed(1)}%`} />
            <DataRow label="AFR (TB9)" value={`${data.tb9_afr.toFixed(1)}:1`} color={data.tb9_afr > 14.5 && data.tb9_afr < 14.9 ? COLORS.emerald : COLORS.cyan} />
          </View>

          {/* Process Rate */}
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Zap size={16} color={COLORS.emerald} />
              <Text style={styles.cardTitle}>PR — Process</Text>
            </View>
            <DataRow label="Timing (PR1)" value={`${data.pr1_timing.toFixed(1)}°`} />
            <DataRow label="Comb.Eff (PR6)" value={`${data.pr6_combEff.toFixed(1)}%`} color={data.pr6_combEff > 96 ? COLORS.emerald : COLORS.cyan} />
            <DataRow label="Load (PR7)" value={`${data.pr7_engLoad.toFixed(1)}%`} />
            <DataRow label="STFT B1 (PR2)" value={`${data.pr2_stftB1 > 0 ? '+' : ''}${data.pr2_stftB1.toFixed(1)}%`} />
            <DataRow label="LTFT B1 (PR3)" value={`${data.pr3_ltftB1 > 0 ? '+' : ''}${data.pr3_ltftB1.toFixed(1)}%`} />
          </View>

          {/* Flow State */}
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Droplets size={16} color={'#a78bfa'} />
              <Text style={styles.cardTitle}>FS — Flow State</Text>
            </View>
            <DataRow label="O2 Up B1 (FS1)" value={`${data.fs1_o2UpB1.toFixed(2)}V`} />
            <DataRow label="O2 Dn B1 (FS2)" value={`${data.fs2_o2DnB1.toFixed(2)}V`} />
            <DataRow label="Cat.Eff (FS7)" value={`${data.fs7_catEff.toFixed(1)}%`} color={data.fs7_catEff > 92 ? COLORS.emerald : '#f59e0b'} />
            <DataRow label="Driver (FS10)" value={`${data.fs10_driverScore.toFixed(0)}/100`} color={data.fs10_driverScore > 80 ? COLORS.emerald : '#f59e0b'} />
          </View>

          {/* System Lifecycle */}
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <ShieldCheck size={16} color={'#f59e0b'} />
              <Text style={styles.cardTitle}>SL — Lifecycle</Text>
            </View>
            <DataRow label="Coolant (SL1)" value={`${data.sl1_coolant.toFixed(1)}°C`} color={data.sl1_coolant < 100 ? COLORS.emerald : '#ef4444'} />
            <DataRow label="Battery (SL3)" value={`${data.sl3_battery.toFixed(1)}V`} color={data.sl3_battery > 13.5 ? COLORS.emerald : '#f59e0b'} />
            <DataRow label="MIL (SL7)" value={data.sl7_mil ? 'ON' : 'OFF'} color={data.sl7_mil ? '#ef4444' : COLORS.emerald} />
            <DataRow label="Health (SL11)" value={`${data.sl11_degradation.toFixed(0)}%`} color={data.sl11_degradation > 80 ? COLORS.emerald : '#f59e0b'} />
          </View>
        </View>

        {/* Condition Report Button */}
        {onReport && (
          <TouchableOpacity style={styles.reportBtn} onPress={onReport}>
            <FileText size={18} color={COLORS.cyan} />
            <Text style={styles.reportBtnText}>GENERATE CONDITION REPORT</Text>
          </TouchableOpacity>
        )}

        {/* Runtime */}
        <Text style={styles.runtime}>Runtime: {data.sl4_runtime}s · 42 nodes · 100ms polling · Deterministic</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function DataRow({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <View style={styles.dataRow}>
      <Text style={styles.dataLabel}>{label}</Text>
      <Text style={[styles.dataValue, color ? { color } : null]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bgDark },
  scrollContent: { padding: 20, paddingBottom: 40 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, marginTop: 20 },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerTitle: { color: COLORS.textMain, fontSize: 20, fontWeight: '800', letterSpacing: 1 },
  headerTitleSub: { color: COLORS.textMuted, fontWeight: '400' },
  connectionBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(16,185,129,0.1)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: 'rgba(16,185,129,0.3)', gap: 8 },
  statusDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.emerald },
  connectionText: { color: COLORS.emerald, fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
  modeBadge: { alignSelf: 'center', paddingHorizontal: 16, paddingVertical: 6, borderRadius: 20, borderWidth: 1, marginBottom: 24 },
  modeText: { fontSize: 11, fontWeight: '700', letterSpacing: 2 },
  telemetryContainer: { alignItems: 'center', justifyContent: 'center', height: 220, marginBottom: 24 },
  glowRing: { position: 'absolute', width: 200, height: 200, borderRadius: 100, borderWidth: 2, borderColor: COLORS.cyan, opacity: 0.5, shadowColor: COLORS.cyan, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 1, shadowRadius: 20, elevation: 10 },
  telemetryCenter: { alignItems: 'center' },
  telemetryValue: { fontSize: 52, fontWeight: '800', color: COLORS.emerald, textShadowColor: COLORS.emeraldGlow, textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 15 },
  telemetryLabel: { fontSize: 11, color: COLORS.textMuted, fontWeight: '600', letterSpacing: 2, marginTop: 4 },
  statsBar: { flexDirection: 'row', justifyContent: 'space-around', backgroundColor: COLORS.bgPanel, borderRadius: 12, padding: 16, marginBottom: 24, borderWidth: 1, borderColor: COLORS.borderLight },
  statItem: { alignItems: 'center' },
  statValue: { color: COLORS.cyan, fontSize: 20, fontWeight: '700', fontFamily: 'monospace' },
  statLabel: { color: COLORS.textDim, fontSize: 10, fontWeight: '600', letterSpacing: 1, marginTop: 4 },
  sectionTitle: { fontSize: 12, color: COLORS.textMuted, fontWeight: '700', letterSpacing: 1.5, marginBottom: 16 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, justifyContent: 'space-between' },
  card: { width: (width - 40 - 12) / 2, backgroundColor: COLORS.bgPanel, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: COLORS.borderLight },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12, borderBottomWidth: 1, borderBottomColor: COLORS.borderLight, paddingBottom: 10 },
  cardTitle: { color: COLORS.textMain, fontSize: 11, fontWeight: '700' },
  dataRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  dataLabel: { color: COLORS.textMuted, fontSize: 10 },
  dataValue: { color: COLORS.cyan, fontSize: 10, fontWeight: '700', fontFamily: 'monospace' },
  reportBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: 'rgba(6,182,212,0.1)', borderWidth: 1, borderColor: COLORS.cyan, borderRadius: 30, padding: 16, marginTop: 24 },
  reportBtnText: { color: COLORS.cyan, fontSize: 12, fontWeight: '700', letterSpacing: 1 },
  runtime: { color: COLORS.textDim, fontSize: 10, textAlign: 'center', marginTop: 16, letterSpacing: 0.5 },
});
