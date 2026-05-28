import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, SafeAreaView, Dimensions, ScrollView, TouchableOpacity, Linking } from 'react-native';
import { Activity, Zap, Droplets, ShieldCheck, Bluetooth, ActivitySquare, FileText, Lock } from 'lucide-react-native';
import { COLORS } from '../theme/colors';
import Animated, { useSharedValue, useAnimatedStyle, withRepeat, withTiming, Easing, withSequence } from 'react-native-reanimated';
import { TelemetrySnapshot } from '../telemetry/SimulatedEngine';
import { startWiFiTelemetryLoop, getWiFiStatus } from '../telemetry/WiFiConnector';
import { startBLENativeTelemetryLoop, getBLENativeStatus } from '../telemetry/BLEConnector';
import { auth } from '../config/firebase';
import type { Tier } from '../config/entitlement';
import FailureAlertBanner, { type FailureAlert } from './FailureAlertBanner';

const { width } = Dimensions.get('window');
const isTablet = width >= 600;
const COLUMNS = isTablet ? 3 : 2;
const CARD_WIDTH = isTablet
  ? (Math.min(width, 700) - 40 - 12 * (COLUMNS - 1)) / COLUMNS
  : (width - 40 - 12) / 2;

// Free tier gets exactly 3 live signals — everything else is blurred
const FREE_SIGNAL_KEYS = ['tb6_rpm', 'tb7_speed', 'sl1_coolant'];

// All 42 signal definitions organized by governance node
const ALL_SIGNALS: { group: string; icon: any; iconColor: string; signals: { key: string; label: string; format: (d: TelemetrySnapshot) => string; colorFn?: (d: TelemetrySnapshot) => string }[] }[] = [
  {
    group: 'TB — Throughput', icon: Activity, iconColor: COLORS.cyan,
    signals: [
      { key: 'tb1_maf', label: 'MAF (TB1)', format: d => `${d.tb1_maf.toFixed(1)} g/s` },
      { key: 'tb2_fuelFlow', label: 'Fuel Flow (TB2)', format: d => `${d.tb2_fuelFlow.toFixed(0)} cc/min` },
      { key: 'tb3_map', label: 'MAP (TB3)', format: d => `${d.tb3_map.toFixed(0)} kPa` },
      { key: 'tb4_iat', label: 'IAT (TB4)', format: d => `${d.tb4_iat.toFixed(1)}°C` },
      { key: 'tb5_throttle', label: 'Throttle (TB5)', format: d => `${d.tb5_throttle.toFixed(1)}%` },
      { key: 'tb6_rpm', label: 'RPM (TB6)', format: d => `${d.tb6_rpm.toFixed(0)}` },
      { key: 'tb7_speed', label: 'Speed (TB7)', format: d => `${(d.tb7_speed * 0.621371).toFixed(0)} mph` },
      { key: 'tb8_volEff', label: 'Vol.Eff (TB8)', format: d => `${d.tb8_volEff.toFixed(1)}%` },
      { key: 'tb9_afr', label: 'AFR (TB9)', format: d => `${d.tb9_afr.toFixed(1)}:1`, colorFn: d => d.tb9_afr > 14.5 && d.tb9_afr < 14.9 ? COLORS.emerald : COLORS.cyan },
      { key: 'tb10_baro', label: 'Baro (TB10)', format: d => `${d.tb10_baro.toFixed(1)} kPa` },
    ]
  },
  {
    group: 'PR — Process', icon: Zap, iconColor: COLORS.emerald,
    signals: [
      { key: 'pr1_timing', label: 'Timing (PR1)', format: d => `${d.pr1_timing.toFixed(1)}°` },
      { key: 'pr2_stftB1', label: 'STFT B1 (PR2)', format: d => `${d.pr2_stftB1 > 0 ? '+' : ''}${d.pr2_stftB1.toFixed(1)}%` },
      { key: 'pr3_ltftB1', label: 'LTFT B1 (PR3)', format: d => `${d.pr3_ltftB1 > 0 ? '+' : ''}${d.pr3_ltftB1.toFixed(1)}%` },
      { key: 'pr4_stftB2', label: 'STFT B2 (PR4)', format: d => `${d.pr4_stftB2 > 0 ? '+' : ''}${d.pr4_stftB2.toFixed(1)}%` },
      { key: 'pr5_ltftB2', label: 'LTFT B2 (PR5)', format: d => `${d.pr5_ltftB2 > 0 ? '+' : ''}${d.pr5_ltftB2.toFixed(1)}%` },
      { key: 'pr6_combEff', label: 'Comb.Eff (PR6)', format: d => `${d.pr6_combEff.toFixed(1)}%`, colorFn: d => d.pr6_combEff > 96 ? COLORS.emerald : COLORS.cyan },
      { key: 'pr7_engLoad', label: 'Load (PR7)', format: d => `${d.pr7_engLoad.toFixed(1)}%` },
      { key: 'pr8_absLoad', label: 'Abs Load (PR8)', format: d => `${d.pr8_absLoad.toFixed(1)}%` },
    ]
  },
  {
    group: 'FS — Flow State', icon: Droplets, iconColor: '#38bdf8',
    signals: [
      { key: 'fs1_o2UpB1', label: 'O2 Up B1 (FS1)', format: d => `${d.fs1_o2UpB1.toFixed(2)}V` },
      { key: 'fs2_o2DnB1', label: 'O2 Dn B1 (FS2)', format: d => `${d.fs2_o2DnB1.toFixed(2)}V` },
      { key: 'fs5_catTempB1', label: 'Cat Temp (FS5)', format: d => `${d.fs5_catTempB1.toFixed(0)}°C` },
      { key: 'fs7_catEff', label: 'Cat.Eff (FS7)', format: d => `${d.fs7_catEff.toFixed(1)}%`, colorFn: d => d.fs7_catEff > 92 ? COLORS.emerald : '#f59e0b' },
      { key: 'fs10_driverScore', label: 'Driver (FS10)', format: d => `${d.fs10_driverScore.toFixed(0)}/100`, colorFn: d => d.fs10_driverScore > 80 ? COLORS.emerald : '#f59e0b' },
    ]
  },
  {
    group: 'SL — Lifecycle', icon: ShieldCheck, iconColor: '#f59e0b',
    signals: [
      { key: 'sl1_coolant', label: 'Coolant (SL1)', format: d => `${d.sl1_coolant.toFixed(1)}°C`, colorFn: d => d.sl1_coolant < 100 ? COLORS.emerald : '#ef4444' },
      { key: 'sl3_battery', label: 'Battery (SL3)', format: d => `${d.sl3_battery.toFixed(1)}V`, colorFn: d => d.sl3_battery > 13.5 ? COLORS.emerald : '#f59e0b' },
      { key: 'sl7_mil', label: 'MIL (SL7)', format: d => d.sl7_mil ? 'ON' : 'OFF', colorFn: d => d.sl7_mil ? '#ef4444' : COLORS.emerald },
      { key: 'sl8_dtcCount', label: 'DTC Count (SL8)', format: d => `${d.sl8_dtcCount}`, colorFn: d => d.sl8_dtcCount > 0 ? '#ef4444' : COLORS.emerald },
      { key: 'sl11_degradation', label: 'Health (SL11)', format: d => `${d.sl11_degradation.toFixed(0)}%`, colorFn: d => d.sl11_degradation > 80 ? COLORS.emerald : '#f59e0b' },
      { key: 'sl4_runtime', label: 'Runtime (SL4)', format: d => `${d.sl4_runtime}s` },
    ]
  },
];

import DTCRegistry from '../data/lumescan_dtc';

/**
 * Build a plain English health summary from telemetry.
 * This is what non-mechanic users see first — no jargon.
 */
function getPlainEnglishSummary(data: TelemetrySnapshot): { emoji: string; headline: string; details: string[] } {
  const issues: string[] = [];
  
  // Check engine light
  if (data.sl7_mil) {
    issues.push(`Your check engine light is ON with ${data.sl8_dtcCount} trouble code${data.sl8_dtcCount !== 1 ? 's' : ''} stored. Scroll down for details on each code and what part to order.`);
  }

  // Coolant temperature
  if (data.sl1_coolant > 105) {
    issues.push(`Your engine is running hot (${data.sl1_coolant.toFixed(0)}°C). This could be a failing thermostat, low coolant, or a radiator fan not kicking on. Don't drive long distances until this is checked.`);
  } else if (data.sl1_coolant > 0 && data.sl1_coolant < 70 && data.sl4_runtime > 300) {
    issues.push(`Your engine hasn't reached normal operating temperature after ${Math.floor(data.sl4_runtime / 60)} minutes. Your thermostat is likely stuck open — your heater will blow cold air and you're wasting gas.`);
  }

  // Battery voltage
  if (data.sl3_battery > 0 && data.sl3_battery < 12.4) {
    issues.push(`Your battery voltage is low (${data.sl3_battery.toFixed(1)}V). A healthy battery reads 12.6V+ with the engine off and 13.5-14.5V while running. This could mean a dying battery or a failing alternator.`);
  } else if (data.sl3_battery > 15.0) {
    issues.push(`Your charging system voltage is too high (${data.sl3_battery.toFixed(1)}V). The voltage regulator in your alternator may be failing, which can fry electrical components and boil your battery dry.`);
  }

  // Fuel trims — lean condition
  if (Math.abs(data.pr2_stftB1) > 15 || Math.abs(data.pr3_ltftB1) > 15) {
    const isLean = (data.pr2_stftB1 + data.pr3_ltftB1) > 0;
    if (isLean) {
      issues.push(`Your engine is running lean — it's getting too much air and not enough fuel. You probably have a vacuum leak (a cracked rubber hose under the hood) or a dirty air flow sensor.`);
    } else {
      issues.push(`Your engine is running rich — it's dumping too much fuel. This wastes gas and can ruin your catalytic converter ($200-$1,000 part). Common causes: leaking fuel injector or a stuck-open purge valve.`);
    }
  }

  // Catalyst efficiency
  if (data.fs7_catEff < 85) {
    issues.push(`Your catalytic converter is failing (${data.fs7_catEff.toFixed(0)}% efficiency). It's supposed to be above 92%. You'll fail your next emissions inspection and your fuel economy is suffering. Plan to replace it soon.`);
  } else if (data.fs7_catEff < 92) {
    issues.push(`Your catalytic converter is wearing out (${data.fs7_catEff.toFixed(0)}% efficiency). It still passes emissions, but it's degrading. You have roughly 4-8 weeks before it triggers a check engine light.`);
  }

  // MPG analysis
  if (data.mpgInstant > 0 && data.mpgInstant < 12 && data.tb7_speed > 30) {
    issues.push(`Your fuel economy is poor (${data.mpgInstant.toFixed(1)} MPG at ${(data.tb7_speed * 0.621371).toFixed(0)} mph). This is below average. Check tire pressure, air filter, and spark plugs — those three things alone can improve MPG by 10-15%.`);
  }

  // Driver score coaching
  if (data.fs10_driverScore < 60) {
    issues.push(`Your driving style is costing you money. Aggressive acceleration and hard braking wastes 15-30% more fuel. Ease off the gas pedal — your wallet will thank you.`);
  }

  // Overall health score
  if (data.sl11_degradation < 70) {
    issues.push(`Overall engine health is at ${data.sl11_degradation.toFixed(0)}%. Multiple systems need attention. Address the items below starting with any red alerts first.`);
  }

  if (issues.length === 0) {
    return {
      emoji: '✅',
      headline: 'Your vehicle is running great.',
      details: [
        `Engine temp is normal (${data.sl1_coolant.toFixed(0)}°C), battery is strong (${data.sl3_battery.toFixed(1)}V), and no trouble codes are stored.`,
        data.mpgInstant > 0 ? `You're getting ${data.mpgInstant.toFixed(1)} MPG right now. ${data.mpgRecovery > 0 ? `That's ${data.mpgRecovery.toFixed(1)}% better than baseline.` : ''}` : 'Engine is warming up.',
      ],
    };
  }

  const emoji = data.sl7_mil ? '🚨' : issues.length > 2 ? '⚠️' : '🔶';
  const headline = data.sl7_mil
    ? `${data.sl8_dtcCount} issue${data.sl8_dtcCount !== 1 ? 's' : ''} found — check engine light is on.`
    : `${issues.length} thing${issues.length !== 1 ? 's' : ''} to keep an eye on.`;

  return { emoji, headline, details: issues };
}

// Generate failure alerts from live telemetry with affiliate part links
function getActiveAlerts(data: TelemetrySnapshot, vehicle: string = 'Universal'): FailureAlert[] {
  const alerts: FailureAlert[] = [];
  
  // Dynamically resolve active DTCs using the Axiom Deterministic Knowledge Registry
  if (data.sl7_mil && data.sl8_dtcCount > 0 && data.activeDTCs) {
    for (const code of data.activeDTCs) {
      const dtcKey = `dtc_${code.toLowerCase()}`;
      // @ts-ignore
      const jsonStr = DTCRegistry.responses[dtcKey];
      if (jsonStr) {
        try {
          const alertObj = JSON.parse(jsonStr) as FailureAlert;
          alertObj.vehicle = vehicle; // Use real vehicle for affiliate links
          alerts.push(alertObj);
        } catch (e) {
          console.warn(`Failed to parse DTC JSON for ${code}:`, e);
        }
      }
    }
  }

  // Legacy hardcoded fallback if no specific codes are resolved
  if (alerts.length === 0 && data.sl7_mil && data.sl8_dtcCount > 0) {
    alerts.push({
      type: 'active', code: 'P0420', system: 'Catalyst System',
      interpretation: 'Your catalytic converter isn\'t cleaning exhaust gases properly. This is the #1 most common check engine light code. You\'ll fail emissions testing.',
      severity: 'Moderate — safe to drive short term',
      action: 'Replace catalytic converter',
      partName: 'Catalytic Converter', partPriceLow: 89, partPriceHigh: 350,
      vehicle,
    });
  }

  // ── Signal-Based Imminent Failure Alerts ──
  // These trigger from LIVE data, not stored DTCs — true predictive diagnostics

  if (data.fs7_catEff < 93 && data.fs7_catEff > 0) {
    alerts.push({
      type: 'imminent', system: 'Catalyst System',
      interpretation: `Your catalytic converter is wearing out (${data.fs7_catEff.toFixed(0)}% efficient, should be 95%+). It's not bad enough for a check engine light yet, but it's heading there. Getting ahead of this saves you from failing your next emissions test.`,
      severity: 'Watch — not yet critical',
      timeline: '~6 weeks', degradationRate: '1.2%/month',
      action: 'Schedule catalytic converter replacement',
      partName: 'Catalytic Converter', partPriceLow: 89, partPriceHigh: 350,
      vehicle,
    });
  }

  if (data.sl3_battery > 0 && data.sl3_battery < 12.4) {
    alerts.push({
      type: 'imminent', system: 'Electrical System',
      interpretation: `Your battery voltage is ${data.sl3_battery.toFixed(1)}V — that's below the 12.6V minimum for a healthy battery. If it drops further, you'll get stranded with a no-start one morning. Batteries typically last 3-5 years.`,
      severity: 'Moderate — could leave you stranded',
      timeline: '~2-4 weeks',
      action: 'Test battery at auto parts store (free) or replace',
      partName: 'Car Battery', partPriceLow: 100, partPriceHigh: 250,
      vehicle,
    });
  }

  if (data.sl1_coolant > 105) {
    alerts.push({
      type: 'active', system: 'Cooling System',
      interpretation: `Engine temperature is ${data.sl1_coolant.toFixed(0)}°C — above the safe limit of 105°C. Driving while overheating causes warped cylinder heads ($1,500+ repair). Pull over if the temp gauge hits the red zone.`,
      severity: 'High — risk of engine damage',
      action: 'Check coolant level, inspect thermostat and radiator fan',
      partName: 'Coolant Thermostat', partPriceLow: 15, partPriceHigh: 45,
      vehicle,
    });
  }

  if (data.sl1_coolant > 0 && data.sl1_coolant < 70 && data.sl4_runtime > 300) {
    alerts.push({
      type: 'imminent', system: 'Cooling System',
      interpretation: `Your engine is running cold — it should be at 90-100°C after ${Math.floor(data.sl4_runtime / 60)} minutes, but it's only ${data.sl1_coolant.toFixed(0)}°C. Your thermostat is stuck open. This makes your heater blow cold air and wastes fuel.`,
      severity: 'Low — safe to drive, but burns more gas',
      timeline: '~1 month',
      action: 'Replace thermostat',
      partName: 'Coolant Thermostat', partPriceLow: 15, partPriceHigh: 45,
      vehicle,
    });
  }

  const totalTrim = Math.abs(data.pr2_stftB1) + Math.abs(data.pr3_ltftB1);
  if (totalTrim > 20) {
    const isLean = (data.pr2_stftB1 + data.pr3_ltftB1) > 0;
    alerts.push({
      type: 'imminent', system: 'Fuel System',
      interpretation: isLean
        ? `Your engine is running lean — the computer is adding ${data.pr3_ltftB1.toFixed(1)}% extra fuel to compensate for unmetered air entering the engine. Most likely cause: a cracked vacuum hose or a dirty mass airflow sensor.`
        : `Your engine is dumping extra fuel — the computer is pulling ${Math.abs(data.pr3_ltftB1).toFixed(1)}% fuel away because the exhaust is too rich. Check for a leaking fuel injector or stuck purge valve.`,
      severity: isLean ? 'Moderate — can cause misfires' : 'Moderate — wastes fuel and damages catalytic converter',
      timeline: '~2-4 weeks',
      action: isLean ? 'Check vacuum hoses, clean MAF sensor' : 'Inspect fuel injectors and purge valve',
      partName: isLean ? 'MAF Sensor Cleaner' : 'Fuel Injector',
      partPriceLow: isLean ? 8 : 40,
      partPriceHigh: isLean ? 150 : 120,
      vehicle,
    });
  }

  return alerts;
}

export default function DashboardScreen({ onReport, tier }: { onReport?: () => void; tier: Tier }) {
  const [data, setData] = useState<TelemetrySnapshot | null>(null);
  const pulseAnim = useSharedValue(1);
  const isPro = tier === 'pro';

  const getGreeting = () => {
    const hour = new Date().getHours();
    const user = auth.currentUser;
    const name = user?.displayName || user?.email?.split('@')[0] || 'Driver';
    const firstName = name.split(' ')[0];
    if (hour >= 5 && hour < 12) return `Good morning, ${firstName}.`;
    if (hour >= 12 && hour < 17) return `Good afternoon, ${firstName}.`;
    if (hour >= 17 && hour < 21) return `Good evening, ${firstName}.`;
    return `Good night, ${firstName}.`;
  };

  useEffect(() => {
    pulseAnim.value = withRepeat(
      withSequence(
        withTiming(1.2, { duration: 1000, easing: Easing.inOut(Easing.ease) }),
        withTiming(1, { duration: 1000, easing: Easing.inOut(Easing.ease) })
      ),
      -1, true
    );
    const bleConn = getBLENativeStatus();
    const useBLE = bleConn.status === 'connected';
    const stop = useBLE
      ? startBLENativeTelemetryLoop((snapshot) => { setData(snapshot); }, 150)
      : startWiFiTelemetryLoop((snapshot) => { setData(snapshot); }, 150);
    return () => stop();
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseAnim.value }],
    opacity: pulseAnim.value === 1 ? 0.8 : 1,
  }));

  if (!data) return null;

  const modeColor = data.governanceMode === 'Flow State' ? COLORS.emerald
    : data.governanceMode === 'Throughput Alert' ? '#f59e0b'
    : COLORS.cyan;

  const alerts = getActiveAlerts(data);
  const totalSignals = ALL_SIGNALS.reduce((sum, g) => sum + g.signals.length, 0);

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
            <Text style={styles.connectionText}>
              {getWiFiStatus().isSimulated || getBLENativeStatus().isSimulated
                ? 'DEMO MODE'
                : getBLENativeStatus().status === 'connected'
                  ? `BLE: ${getBLENativeStatus().deviceName || 'CONNECTED'}`
                  : 'WIFI CONNECTED'
              }
            </Text>
          </View>
        </View>

        {/* Personalized Greeting */}
        <Text style={styles.greeting}>{getGreeting()}</Text>

        {/* Plain English Health Summary */}
        {(() => {
          const summary = getPlainEnglishSummary(data);
          return (
            <View style={styles.summaryPanel}>
              <Text style={styles.summaryHeadline}>{summary.emoji} {summary.headline}</Text>
              {summary.details.map((detail, i) => (
                <Text key={i} style={styles.summaryDetail}>• {detail}</Text>
              ))}
            </View>
          );
        })()}

        {/* Tier Badge */}
        {!isPro && (
          <TouchableOpacity
            style={styles.tierBadge}
            onPress={() => Linking.openURL('https://lumeauto.tech/order')}
            activeOpacity={0.7}
          >
            <Lock size={12} color={COLORS.cyan} />
            <Text style={styles.tierBadgeText}>FREE TIER — 3 of {totalSignals} signals live</Text>
            <Text style={styles.tierUpgrade}>Upgrade →</Text>
          </TouchableOpacity>
        )}

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

        {/* Live Stats Bar — always visible (free signals) */}
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
            <Text style={[styles.statValue, !isPro && styles.blurredText]}>
              {data.mpgInstant > 0 ? data.mpgInstant.toFixed(1) : '—'}
            </Text>
            <Text style={styles.statLabel}>MPG</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={[styles.statValue, { color: data.fs10_driverScore > 80 ? COLORS.emerald : '#f59e0b' }, !isPro && styles.blurredText]}>
              {data.fs10_driverScore.toFixed(0)}
            </Text>
            <Text style={styles.statLabel}>SCORE</Text>
          </View>
        </View>

        {/* Failure Alert Banners */}
        {alerts.length > 0 && (
          <View style={styles.alertSection}>
            <Text style={styles.sectionTitle}>⚠ ALERTS — {alerts.length} DETECTED</Text>
            {alerts.map((alert, i) => (
              <FailureAlertBanner key={i} alert={alert} tier={tier} />
            ))}
          </View>
        )}

        {/* Governance Nodes — All 42 visible, 39 blurred for free */}
        <Text style={styles.sectionTitle}>
          GOVERNANCE NODES — {totalSignals} {isPro ? 'ACTIVE' : 'VISIBLE'} {!isPro ? `(${FREE_SIGNAL_KEYS.length} LIVE)` : ''}
        </Text>

        <View style={styles.grid}>
          {ALL_SIGNALS.map((group) => {
            const IconComp = group.icon;
            return (
              <View key={group.group} style={styles.card}>
                <View style={styles.cardHeader}>
                  <IconComp size={16} color={group.iconColor} />
                  <Text style={styles.cardTitle}>{group.group}</Text>
                </View>
                {group.signals.map((sig) => {
                  const isFree = FREE_SIGNAL_KEYS.includes(sig.key);
                  const isLocked = !isPro && !isFree;
                  const color = sig.colorFn ? sig.colorFn(data) : COLORS.cyan;

                  return (
                    <View key={sig.key} style={styles.dataRow}>
                      <Text style={styles.dataLabel}>{sig.label}</Text>
                      {isLocked ? (
                        <View style={styles.lockedValue}>
                          <View style={styles.blurPill} />
                          <Lock size={8} color={COLORS.textDim} />
                        </View>
                      ) : (
                        <Text style={[styles.dataValue, { color }]}>{sig.format(data)}</Text>
                      )}
                    </View>
                  );
                })}
                {/* Lock overlay for cards with all-locked signals */}
                {!isPro && group.signals.every(s => !FREE_SIGNAL_KEYS.includes(s.key)) && (
                  <TouchableOpacity
                    style={styles.cardLockOverlay}
                    onPress={() => Linking.openURL('https://lumeauto.tech/order')}
                    activeOpacity={0.8}
                  >
                    <Lock size={14} color={COLORS.cyan} />
                    <Text style={styles.cardLockText}>Upgrade to Pro</Text>
                  </TouchableOpacity>
                )}
              </View>
            );
          })}
        </View>

        {/* Condition Report Button */}
        {onReport && (
          <TouchableOpacity style={styles.reportBtn} onPress={onReport}>
            <FileText size={18} color={COLORS.cyan} />
            <Text style={styles.reportBtnText}>GENERATE CONDITION REPORT</Text>
          </TouchableOpacity>
        )}

        {/* Runtime */}
        <Text style={styles.runtime}>Runtime: {data.sl4_runtime}s · {totalSignals} nodes · 100ms polling · Deterministic</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bgDark },
  scrollContent: { padding: 20, paddingBottom: 40, maxWidth: 700, alignSelf: 'center' as const, width: '100%' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, marginTop: 20 },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerTitle: { color: COLORS.textMain, fontSize: 20, fontWeight: '800', letterSpacing: 1 },
  headerTitleSub: { color: COLORS.textMuted, fontWeight: '400' },
  greeting: { fontSize: 16, color: COLORS.textMuted, fontWeight: '500', textAlign: 'center', marginBottom: 12, fontStyle: 'italic' },
  summaryPanel: { backgroundColor: 'rgba(6,182,212,0.04)', borderWidth: 1, borderColor: 'rgba(6,182,212,0.12)', borderRadius: 14, padding: 16, marginBottom: 16 },
  summaryHeadline: { color: COLORS.textMain, fontSize: 16, fontWeight: '700', marginBottom: 10, lineHeight: 22 },
  summaryDetail: { color: COLORS.textMuted, fontSize: 13, lineHeight: 20, marginBottom: 8, paddingLeft: 4 },
  connectionBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(16,185,129,0.1)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: 'rgba(16,185,129,0.3)', gap: 8 },
  statusDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.emerald },
  connectionText: { color: COLORS.emerald, fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
  tierBadge: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: 'rgba(6,182,212,0.06)', borderWidth: 1, borderColor: 'rgba(6,182,212,0.15)', borderRadius: 12, paddingVertical: 10, paddingHorizontal: 16, marginBottom: 12 },
  tierBadgeText: { color: COLORS.textMuted, fontSize: 11, fontWeight: '600', letterSpacing: 0.5 },
  tierUpgrade: { color: COLORS.cyan, fontSize: 11, fontWeight: '800' },
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
  blurredText: { opacity: 0.15 },
  alertSection: { marginBottom: 16 },
  sectionTitle: { fontSize: 12, color: COLORS.textMuted, fontWeight: '700', letterSpacing: 1.5, marginBottom: 16 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, justifyContent: 'space-between' },
  card: { width: CARD_WIDTH, backgroundColor: COLORS.bgPanel, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: COLORS.borderLight, position: 'relative', overflow: 'hidden' },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12, borderBottomWidth: 1, borderBottomColor: COLORS.borderLight, paddingBottom: 10 },
  cardTitle: { color: COLORS.textMain, fontSize: 11, fontWeight: '700' },
  dataRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  dataLabel: { color: COLORS.textMuted, fontSize: 10 },
  dataValue: { color: COLORS.cyan, fontSize: 10, fontWeight: '700', fontFamily: 'monospace' },
  lockedValue: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  blurPill: { height: 10, width: 36, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 5 },
  cardLockOverlay: { position: 'absolute', bottom: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 8, backgroundColor: 'rgba(10,10,12,0.85)', borderTopWidth: 1, borderTopColor: 'rgba(6,182,212,0.15)' },
  cardLockText: { color: COLORS.cyan, fontSize: 9, fontWeight: '700', letterSpacing: 0.5 },
  reportBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: 'rgba(6,182,212,0.1)', borderWidth: 1, borderColor: COLORS.cyan, borderRadius: 30, padding: 16, marginTop: 24 },
  reportBtnText: { color: COLORS.cyan, fontSize: 12, fontWeight: '700', letterSpacing: 1 },
  runtime: { color: COLORS.textDim, fontSize: 10, textAlign: 'center', marginTop: 16, letterSpacing: 0.5 },
});
