/**
 * LumeScan — Trip Computer Screen
 * ===================================
 * Session-level MPG, distance, duration, driver scoring.
 * Accumulates data from 42-signal telemetry loop.
 * Pro-only feature — Free users see a teaser.
 *
 * DarkWave Studios LLC — Copyright 2026
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView, ScrollView,
  TouchableOpacity, Linking,
} from 'react-native';
import {
  Navigation, Gauge, Fuel, Clock, Activity, TrendingUp,
  Play, Square, RotateCcw, Lock, Zap,
} from 'lucide-react-native';
import { COLORS } from '../theme/colors';
import { type TelemetrySnapshot } from '../telemetry/SimulatedEngine';
import { startBLENativeTelemetryLoop, getBLENativeStatus } from '../telemetry/BLEConnector';
import { startWiFiTelemetryLoop } from '../telemetry/WiFiConnector';
import type { Tier } from '../config/entitlement';

interface Props {
  tier: Tier;
}

interface TripStats {
  distanceMiles: number;
  durationSeconds: number;
  avgSpeedMph: number;
  maxSpeedMph: number;
  avgMpg: number;
  fuelUsedGallons: number;
  avgRpm: number;
  maxRpm: number;
  driverScore: number;
  hardBrakes: number;
  rapidAccels: number;
  idleTimeSeconds: number;
  samples: number;
}

export default function TripComputerScreen({ tier }: Props) {
  const [active, setActive] = useState(false);
  const [stats, setStats] = useState<TripStats>({
    distanceMiles: 0, durationSeconds: 0, avgSpeedMph: 0, maxSpeedMph: 0,
    avgMpg: 0, fuelUsedGallons: 0, avgRpm: 0, maxRpm: 0,
    driverScore: 0, hardBrakes: 0, rapidAccels: 0, idleTimeSeconds: 0, samples: 0,
  });
  const [lastSnapshot, setLastSnapshot] = useState<TelemetrySnapshot | null>(null);
  const timerRef = useRef<(() => void) | null>(null);
  const startTimeRef = useRef(0);
  const activeRef = useRef(false);
  const accumulatorsRef = useRef({ speedSum: 0, mpgSum: 0, rpmSum: 0, scoreSum: 0, prevSpeed: 0, prevThrottle: 0 });

  const isPro = tier === 'pro';

  const startTrip = () => {
    setActive(true);
    activeRef.current = true;
    startTimeRef.current = Date.now();
    accumulatorsRef.current = { speedSum: 0, mpgSum: 0, rpmSum: 0, scoreSum: 0, prevSpeed: 0, prevThrottle: 0 };
    setStats({
      distanceMiles: 0, durationSeconds: 0, avgSpeedMph: 0, maxSpeedMph: 0,
      avgMpg: 0, fuelUsedGallons: 0, avgRpm: 0, maxRpm: 0,
      driverScore: 0, hardBrakes: 0, rapidAccels: 0, idleTimeSeconds: 0, samples: 0,
    });

    // Start real telemetry loop — BLE first, WiFi fallback (same as Dashboard)
    const useBLE = getBLENativeStatus().status === 'connected';
    const stopLoop = useBLE
      ? startBLENativeTelemetryLoop(processSnapshot, 1000)
      : startWiFiTelemetryLoop(processSnapshot, 1000);
    timerRef.current = stopLoop;
  };

  const processSnapshot = (snapshot: TelemetrySnapshot) => {
    if (!activeRef.current) return;
    setLastSnapshot(snapshot);

    setStats(prev => {
        const n = prev.samples + 1;
        const acc = accumulatorsRef.current;
        const speedMph = snapshot.tb7_speed * 0.621371;
        const rpm = snapshot.tb6_rpm;
        // Calculate instantaneous MPG from MAF and speed
        // MPG = (speed_mph * 7.718) / MAF_grams_per_sec (standard formula)
        const maf = snapshot.tb1_maf;
        const mpg = maf > 0 && speedMph > 3 ? (speedMph * 7.718) / maf : 0;
        const driverScore = snapshot.fs10_driverScore || 80;
        const elapsed = Math.floor((Date.now() - startTimeRef.current) / 1000);

        acc.speedSum += speedMph;
        acc.mpgSum += mpg;
        acc.rpmSum += rpm;
        acc.scoreSum += driverScore;

        // Detect hard brakes (speed drop > 15 mph/s)
        let hardBrakes = prev.hardBrakes;
        if (acc.prevSpeed - speedMph > 15) hardBrakes++;

        // Detect rapid accelerations (throttle jump > 50%)
        let rapidAccels = prev.rapidAccels;
        if (snapshot.tb5_throttle - acc.prevThrottle > 50) rapidAccels++;

        acc.prevSpeed = speedMph;
        acc.prevThrottle = snapshot.tb5_throttle;

        // Distance from speed * time (1 second intervals)
        const distDelta = speedMph / 3600; // miles per second
        const idleDelta = speedMph < 3 ? 1 : 0;

        // Fuel used estimation from MAF (reuses maf from line 79)
        const fuelDelta = maf > 0 ? (maf * 0.0805 / 14.7 * 6.17) / 3600 : 0;

        return {
          distanceMiles: prev.distanceMiles + distDelta,
          durationSeconds: elapsed,
          avgSpeedMph: acc.speedSum / n,
          maxSpeedMph: Math.max(prev.maxSpeedMph, speedMph),
          avgMpg: acc.mpgSum / Math.max(1, n - (prev.idleTimeSeconds + idleDelta)),
          fuelUsedGallons: prev.fuelUsedGallons + fuelDelta,
          avgRpm: acc.rpmSum / n,
          maxRpm: Math.max(prev.maxRpm, rpm),
          driverScore: acc.scoreSum / n,
          hardBrakes,
          rapidAccels,
          idleTimeSeconds: prev.idleTimeSeconds + idleDelta,
          samples: n,
        };
    });
  };

  const stopTrip = () => {
    setActive(false);
    activeRef.current = false;
    if (timerRef.current) {
      timerRef.current();
      timerRef.current = null;
    }
  };

  const resetTrip = () => {
    stopTrip();
    setStats({
      distanceMiles: 0, durationSeconds: 0, avgSpeedMph: 0, maxSpeedMph: 0,
      avgMpg: 0, fuelUsedGallons: 0, avgRpm: 0, maxRpm: 0,
      driverScore: 0, hardBrakes: 0, rapidAccels: 0, idleTimeSeconds: 0, samples: 0,
    });
    setLastSnapshot(null);
  };

  useEffect(() => {
    return () => {
      if (timerRef.current) timerRef.current();
    };
  }, []);

  const formatTime = (s: number) => {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`;
  };

  const scoreColor = stats.driverScore >= 80 ? COLORS.emerald : stats.driverScore >= 60 ? '#f59e0b' : '#ef4444';

  if (!isPro) {
    return (
      <SafeAreaView style={styles.container}>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <View style={styles.header}>
            <Navigation size={22} color={COLORS.cyan} />
            <Text style={styles.headerTitle}>Trip Computer</Text>
          </View>
          <View style={styles.lockedCard}>
            <Fuel size={48} color={COLORS.cyan} style={{ marginBottom: 16 }} />
            <Text style={styles.lockedTitle}>Real-Time Trip Tracking</Text>
            <Text style={styles.lockedDesc}>
              Track every drive with session MPG, distance, driver scoring, fuel usage, and driving behavior analysis. See exactly how your driving affects fuel economy.
            </Text>
            <TouchableOpacity style={styles.lockedBtn} onPress={() => Linking.openURL('https://lumeauto.tech/order')}>
              <Lock size={14} color="#000" />
              <Text style={styles.lockedBtnText}>Upgrade to Pro</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Navigation size={22} color={COLORS.cyan} />
            <Text style={styles.headerTitle}>Trip Computer</Text>
          </View>
          {active && (
            <View style={styles.liveBadge}>
              <View style={styles.liveDot} />
              <Text style={styles.liveText}>RECORDING</Text>
            </View>
          )}
        </View>

        {/* Hero stats */}
        <View style={styles.heroGrid}>
          <View style={[styles.heroCard, styles.heroCardWide]}>
            <Fuel size={18} color={COLORS.cyan} />
            <Text style={styles.heroValue}>{stats.avgMpg > 0 ? stats.avgMpg.toFixed(1) : '—'}</Text>
            <Text style={styles.heroLabel}>AVG MPG</Text>
          </View>
          <View style={styles.heroCard}>
            <Navigation size={16} color={COLORS.emerald} />
            <Text style={styles.heroValue}>{stats.distanceMiles.toFixed(1)}</Text>
            <Text style={styles.heroLabel}>MILES</Text>
          </View>
          <View style={styles.heroCard}>
            <Clock size={16} color={COLORS.textMuted} />
            <Text style={styles.heroValue}>{formatTime(stats.durationSeconds)}</Text>
            <Text style={styles.heroLabel}>DURATION</Text>
          </View>
        </View>

        {/* Detail stats */}
        <View style={styles.detailGrid}>
          {[
            { label: 'Avg Speed', value: `${stats.avgSpeedMph.toFixed(0)} mph`, icon: Gauge },
            { label: 'Max Speed', value: `${stats.maxSpeedMph.toFixed(0)} mph`, icon: TrendingUp },
            { label: 'Fuel Used', value: `${stats.fuelUsedGallons.toFixed(2)} gal`, icon: Fuel },
            { label: 'Avg RPM', value: stats.avgRpm.toFixed(0), icon: Activity },
            { label: 'Max RPM', value: stats.maxRpm.toFixed(0), icon: Zap },
            { label: 'Idle Time', value: formatTime(stats.idleTimeSeconds), icon: Clock },
          ].map((item, i) => (
            <View key={i} style={styles.detailCard}>
              <item.icon size={14} color={COLORS.textDim} />
              <Text style={styles.detailValue}>{item.value}</Text>
              <Text style={styles.detailLabel}>{item.label}</Text>
            </View>
          ))}
        </View>

        {/* Driver Score */}
        <View style={styles.scoreCard}>
          <Text style={styles.scoreSectionTitle}>DRIVER SCORE</Text>
          <View style={styles.scoreRow}>
            <View style={[styles.scoreBadge, { borderColor: `${scoreColor}33`, backgroundColor: `${scoreColor}11` }]}>
              <Text style={[styles.scoreValue, { color: scoreColor }]}>
                {stats.driverScore > 0 ? Math.round(stats.driverScore) : '—'}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <View style={styles.behaviorRow}>
                <Text style={styles.behaviorLabel}>Hard Brakes</Text>
                <Text style={[styles.behaviorValue, stats.hardBrakes > 2 && { color: '#ef4444' }]}>{stats.hardBrakes}</Text>
              </View>
              <View style={styles.behaviorRow}>
                <Text style={styles.behaviorLabel}>Rapid Accelerations</Text>
                <Text style={[styles.behaviorValue, stats.rapidAccels > 3 && { color: '#f59e0b' }]}>{stats.rapidAccels}</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Controls */}
        <View style={styles.controls}>
          {!active ? (
            <TouchableOpacity style={styles.startBtn} onPress={startTrip} activeOpacity={0.7}>
              <Play size={24} color="#000" />
              <Text style={styles.startBtnText}>{stats.samples > 0 ? 'RESUME TRIP' : 'START TRIP'}</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={styles.stopBtn} onPress={stopTrip} activeOpacity={0.7}>
              <Square size={20} color="#fff" />
              <Text style={styles.stopBtnText}>STOP</Text>
            </TouchableOpacity>
          )}
          {stats.samples > 0 && !active && (
            <TouchableOpacity style={styles.resetBtn} onPress={resetTrip} activeOpacity={0.7}>
              <RotateCcw size={16} color={COLORS.textMuted} />
              <Text style={styles.resetBtnText}>Reset Trip</Text>
            </TouchableOpacity>
          )}
        </View>

        <Text style={styles.disclaimer}>
          Trip data is calculated from OBD-II signals (MAF, speed, RPM). Fuel estimates may differ from actual consumption. Session data is not persisted between app restarts.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bgDark },
  scrollContent: { padding: 20, paddingTop: 60, paddingBottom: 40, maxWidth: 700, alignSelf: 'center' as const, width: '100%' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerTitle: { color: COLORS.textMain, fontSize: 20, fontWeight: '800' },
  liveBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10, backgroundColor: 'rgba(239,68,68,0.1)', borderWidth: 1, borderColor: 'rgba(239,68,68,0.3)' },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#ef4444' },
  liveText: { fontSize: 9, color: '#ef4444', fontWeight: '800', letterSpacing: 1 },
  // Hero
  heroGrid: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  heroCard: { flex: 1, backgroundColor: COLORS.bgPanel, borderRadius: 14, padding: 16, alignItems: 'center', borderWidth: 1, borderColor: COLORS.borderLight },
  heroCardWide: { flex: 1.5, borderColor: 'rgba(6,182,212,0.15)' },
  heroValue: { color: COLORS.textMain, fontSize: 24, fontWeight: '900', fontFamily: 'monospace', marginTop: 8 },
  heroLabel: { color: COLORS.textDim, fontSize: 8, fontWeight: '700', letterSpacing: 1.5, marginTop: 4 },
  // Detail
  detailGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  detailCard: { width: '31%', backgroundColor: COLORS.bgPanel, borderRadius: 10, padding: 12, alignItems: 'center', borderWidth: 1, borderColor: COLORS.borderLight },
  detailValue: { color: COLORS.textMain, fontSize: 14, fontWeight: '800', fontFamily: 'monospace', marginTop: 6 },
  detailLabel: { color: COLORS.textDim, fontSize: 8, fontWeight: '600', letterSpacing: 0.5, marginTop: 4 },
  // Score
  scoreCard: { backgroundColor: COLORS.bgPanel, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: COLORS.borderLight, marginBottom: 16 },
  scoreSectionTitle: { fontSize: 9, color: COLORS.textDim, fontWeight: '700', letterSpacing: 1.5, marginBottom: 12 },
  scoreRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  scoreBadge: { width: 64, height: 64, borderRadius: 16, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  scoreValue: { fontSize: 24, fontWeight: '900', fontFamily: 'monospace' },
  behaviorRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 },
  behaviorLabel: { color: COLORS.textMuted, fontSize: 12 },
  behaviorValue: { color: COLORS.textMain, fontSize: 14, fontWeight: '700', fontFamily: 'monospace' },
  // Controls
  controls: { gap: 10, marginTop: 8 },
  startBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 18, borderRadius: 16, backgroundColor: COLORS.emerald },
  startBtnText: { color: '#000', fontSize: 16, fontWeight: '900', letterSpacing: 2 },
  stopBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 18, borderRadius: 16, backgroundColor: '#ef4444' },
  stopBtnText: { color: '#fff', fontSize: 16, fontWeight: '900', letterSpacing: 2 },
  resetBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 12, borderRadius: 12, borderWidth: 1, borderColor: COLORS.borderLight },
  resetBtnText: { color: COLORS.textMuted, fontSize: 13, fontWeight: '600' },
  disclaimer: { fontSize: 10, color: COLORS.textDim, textAlign: 'center', marginTop: 24, lineHeight: 16 },
  // Locked
  lockedCard: { alignItems: 'center', padding: 32, marginTop: 20 },
  lockedTitle: { color: COLORS.textMain, fontSize: 22, fontWeight: '800', marginBottom: 8 },
  lockedDesc: { color: COLORS.textMuted, fontSize: 14, lineHeight: 22, textAlign: 'center', marginBottom: 24, maxWidth: 320 },
  lockedBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 16, paddingHorizontal: 32, backgroundColor: COLORS.cyan, borderRadius: 14 },
  lockedBtnText: { color: '#000', fontSize: 16, fontWeight: '800' },
});
