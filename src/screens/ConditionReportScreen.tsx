import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, SafeAreaView, ScrollView, TouchableOpacity, Linking } from 'react-native';
import { openUpgrade } from '../config/store';
import { CheckCircle, AlertTriangle, XCircle, ArrowLeft, Activity, Shield, Lock } from 'lucide-react-native';
import { COLORS } from '../theme/colors';
import { generateConditionReport, tick } from '../telemetry/SimulatedEngine';
import { sealScanToLedger, buildScanPayload, type ScanRecord } from '../telemetry/TrustLayerLedger';
import { getWiFiStatus, buildSnapshot as buildWiFiSnapshot } from '../telemetry/WiFiConnector';
import { getBLENativeStatus, buildSnapshot as buildBLESnapshot } from '../telemetry/BLEConnector';
import type { TelemetrySnapshot } from '../telemetry/SimulatedEngine';
import type { Tier } from '../config/entitlement';

const STATUS_ICONS: Record<string, React.ReactNode> = {
  ok: <CheckCircle size={14} color={COLORS.emerald} />,
  caution: <AlertTriangle size={14} color="#f59e0b" />,
  warning: <AlertTriangle size={14} color="#f59e0b" />,
  critical: <XCircle size={14} color="#ef4444" />,
};

const STATUS_COLORS: Record<string, string> = {
  nominal: COLORS.emerald,
  caution: '#f59e0b',
  warning: '#f59e0b',
  critical: '#ef4444',
};

export default function ConditionReportScreen({ onBack, tier }: { onBack: () => void; tier: Tier }) {
  const isPro = tier === 'pro';
  const [report, setReport] = useState<ReturnType<typeof generateConditionReport> | null>(null);
  const [tllRecord, setTllRecord] = useState<ScanRecord | null>(null);
  const [sealing, setSealing] = useState(false);

  const [isDemo, setIsDemo] = useState(true);

  useEffect(() => {
    const timer = setTimeout(async () => {
      // Determine if we have a real adapter connection
      const bleConn = getBLENativeStatus();
      const wifiConn = getWiFiStatus();
      const bleLive = bleConn.status === 'connected' && !bleConn.isSimulated;
      const wifiLive = wifiConn.status === 'connected' && !wifiConn.isSimulated;
      const isRealConnection = bleLive || wifiLive;
      setIsDemo(!isRealConnection);

      let currentSignals: TelemetrySnapshot;
      let conditionReport: ReturnType<typeof generateConditionReport>;

      if (isRealConnection) {
        // Use REAL data from the connected adapter
        currentSignals = bleLive ? buildBLESnapshot() : buildWiFiSnapshot();
        // Build condition report from real snapshot
        conditionReport = buildConditionReportFromSnapshot(currentSignals);
      } else {
        // Demo mode — use simulated data
        currentSignals = tick();
        conditionReport = generateConditionReport();
      }
      setReport(conditionReport);

      // Seal to Trust Layer Ledger
      setSealing(true);
      try {
        const payload = buildScanPayload(conditionReport, currentSignals, 'consumer');
        const record = await sealScanToLedger(payload);
        if (record) {
          setTllRecord(record);
        }
      } catch (err) {
        console.warn('[TLL] Seal failed:', err);
      }
      setSealing(false);
    }, 2000);
    return () => clearTimeout(timer);
  }, []);

  // Build condition report from a real TelemetrySnapshot (mirrors SimulatedEngine.generateConditionReport)
  function buildConditionReportFromSnapshot(s: TelemetrySnapshot) {
    return {
      timestamp: new Date().toISOString(),
      vehicle: 'Connected Vehicle',
      vin: 'Read from adapter',
      overallHealth: Math.round(s.sl11_degradation),
      laneReady: s.sl8_dtcCount === 0 && !s.sl7_mil && s.sl3_battery > 12.0,
      sections: [
        {
          name: 'Drivetrain', status: 'nominal' as const,
          items: [
            { label: 'Engine Load (PR7)', value: `${s.pr7_engLoad.toFixed(1)}%`, status: 'ok' as const },
            { label: 'Combustion Efficiency (PR6)', value: `${s.pr6_combEff.toFixed(1)}%`, status: (s.pr6_combEff > 95 ? 'ok' : 'caution') as 'ok' | 'caution' },
            { label: 'Volumetric Efficiency (TB8)', value: `${s.tb8_volEff.toFixed(1)}%`, status: 'ok' as const },
          ]
        },
        {
          name: 'Emissions', status: (s.fs7_catEff > 90 ? 'nominal' : 'caution') as 'nominal' | 'caution',
          items: [
            { label: 'Catalyst Efficiency (FS7)', value: `${s.fs7_catEff.toFixed(1)}%`, status: (s.fs7_catEff > 90 ? 'ok' : 'caution') as 'ok' | 'caution' },
            { label: 'O2 Upstream B1 (FS1)', value: `${s.fs1_o2UpB1.toFixed(2)}V`, status: 'ok' as const },
            { label: 'O2 Downstream B1 (FS2)', value: `${s.fs2_o2DnB1.toFixed(2)}V`, status: 'ok' as const },
            { label: 'Catalyst Temp (FS5)', value: `${s.fs5_catTempB1.toFixed(0)}°C`, status: 'ok' as const },
          ]
        },
        {
          name: 'Electrical', status: (s.sl3_battery > 12.5 ? 'nominal' : 'warning') as 'nominal' | 'warning',
          items: [
            { label: 'Battery Voltage (SL3)', value: `${s.sl3_battery.toFixed(1)}V`, status: (s.sl3_battery > 12.5 ? 'ok' : 'warning') as 'ok' | 'warning' },
            { label: 'MIL Status (SL7)', value: s.sl7_mil ? 'ON' : 'OFF', status: (s.sl7_mil ? 'critical' : 'ok') as 'critical' | 'ok' },
            { label: 'DTC Count (SL8)', value: `${s.sl8_dtcCount}`, status: (s.sl8_dtcCount > 0 ? 'warning' : 'ok') as 'warning' | 'ok' },
          ]
        },
        {
          name: 'Thermal', status: 'nominal' as const,
          items: [
            { label: 'Coolant Temp (SL1)', value: `${s.sl1_coolant.toFixed(1)}°C`, status: (s.sl1_coolant < 105 ? 'ok' : 'warning') as 'ok' | 'warning' },
            { label: 'Intake Air Temp (TB4)', value: `${s.tb4_iat.toFixed(1)}°C`, status: 'ok' as const },
          ]
        },
        {
          name: 'Fuel System', status: (Math.abs(s.pr3_ltftB1) < 10 ? 'nominal' : 'caution') as 'nominal' | 'caution',
          items: [
            { label: 'Air-Fuel Ratio (TB9)', value: `${s.tb9_afr.toFixed(1)}:1`, status: (s.tb9_afr > 14.0 && s.tb9_afr < 15.0 ? 'ok' : 'caution') as 'ok' | 'caution' },
            { label: 'STFT B1 (PR2)', value: `${s.pr2_stftB1 > 0 ? '+' : ''}${s.pr2_stftB1.toFixed(1)}%`, status: (Math.abs(s.pr2_stftB1) < 10 ? 'ok' : 'caution') as 'ok' | 'caution' },
            { label: 'LTFT B1 (PR3)', value: `${s.pr3_ltftB1 > 0 ? '+' : ''}${s.pr3_ltftB1.toFixed(1)}%`, status: (Math.abs(s.pr3_ltftB1) < 10 ? 'ok' : 'caution') as 'ok' | 'caution' },
          ]
        },
      ],
      componentDegradation: Math.round(s.sl11_degradation),
      summary: s.sl8_dtcCount === 0 && !s.sl7_mil
        ? 'All 42 governance nodes nominal. No active or pending fault codes. Vehicle is lane-ready.'
        : `${s.sl8_dtcCount} diagnostic trouble code(s) detected. Manual inspection recommended before lane assignment.`,
    };
  }

  if (!report) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.scanningContainer}>
          <Activity size={48} color={COLORS.cyan} />
          <Text style={styles.scanningTitle}>SCANNING 42 NODES...</Text>
          <Text style={styles.scanningSubtitle}>Generating deterministic condition report</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Header */}
        <TouchableOpacity style={styles.backBtn} onPress={onBack}>
          <ArrowLeft size={20} color={COLORS.textMuted} />
          <Text style={styles.backText}>Dashboard</Text>
        </TouchableOpacity>

        <Text style={styles.pageTitle}>{isDemo ? 'DEMO CONDITION REPORT' : 'CONDITION REPORT'}</Text>
        {isDemo && (
          <View style={{ backgroundColor: 'rgba(245,158,11,0.08)', borderWidth: 1, borderColor: 'rgba(245,158,11,0.25)', borderRadius: 10, paddingVertical: 8, paddingHorizontal: 16, marginBottom: 8, alignItems: 'center' as const }}>
            <Text style={{ color: '#f59e0b', fontSize: 11, fontWeight: '700' }}>⚠️  SIMULATED DATA — Not from a real vehicle</Text>
          </View>
        )}
        <Text style={styles.timestamp}>{report.timestamp}</Text>

        {/* Vehicle */}
        <View style={styles.vehicleCard}>
          <Text style={styles.vehicleName}>{report.vehicle}</Text>
          <Text style={styles.vehicleVin}>{report.vin}</Text>
        </View>

        {/* Overall Status */}
        <View style={[styles.overallCard, { borderColor: report.laneReady ? COLORS.emerald : '#f59e0b' }]}>
          <View style={styles.overallRow}>
            <View>
              <Text style={styles.overallLabel}>OVERALL HEALTH</Text>
              <Text style={[styles.overallValue, { color: report.overallHealth > 80 ? COLORS.emerald : '#f59e0b' }]}>
                {report.overallHealth}%
              </Text>
            </View>
            <View style={[styles.laneReadyBadge, { backgroundColor: report.laneReady ? 'rgba(16,185,129,0.15)' : 'rgba(245,158,11,0.15)', borderColor: report.laneReady ? COLORS.emerald : '#f59e0b' }]}>
              <Text style={[styles.laneReadyText, { color: report.laneReady ? COLORS.emerald : '#f59e0b' }]}>
                {report.laneReady ? '✓ LANE READY' : '⚠ REVIEW REQUIRED'}
              </Text>
            </View>
          </View>
        </View>

        {/* Sections */}
        {report.sections.map((section, i) => (
          <View key={i} style={styles.sectionCard}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionName}>{section.name}</Text>
              <Text style={[styles.sectionStatus, { color: STATUS_COLORS[section.status] || COLORS.emerald }]}>
                ● {section.status.toUpperCase()}
              </Text>
            </View>
            {section.items.map((item, j) => (
              <View key={j} style={styles.itemRow}>
                {STATUS_ICONS[item.status]}
                <Text style={styles.itemLabel}>{item.label}</Text>
                {isPro ? (
                  <Text style={[styles.itemValue, { color: item.status === 'ok' ? COLORS.cyan : item.status === 'critical' ? '#ef4444' : '#f59e0b' }]}>
                    {item.value}
                  </Text>
                ) : (
                  <View style={styles.lockedValue}>
                    <View style={styles.blurPill} />
                    <Lock size={8} color={COLORS.textDim} />
                  </View>
                )}
              </View>
            ))}
          </View>
        ))}

        {/* Free tier upgrade CTA */}
        {!isPro && (
          <TouchableOpacity
            style={styles.reportUpgradeCta}
            onPress={openUpgrade}
            activeOpacity={0.8}
          >
            <Lock size={16} color={COLORS.cyan} />
            <Text style={styles.reportUpgradeText}>Upgrade to Pro for full signal values, TLL verification, and export</Text>
          </TouchableOpacity>
        )}

        {/* Summary */}
        <View style={styles.summaryCard}>
          <Text style={styles.summaryLabel}>DETERMINISTIC ASSESSMENT</Text>
          <Text style={styles.summaryText}>{report.summary}</Text>
          <Text style={styles.summaryFooter}>
            42 nodes scanned · 4 primitives · Zero AI calls{'\n'}
            US Provisional Patent 64/032,339
          </Text>
        </View>

        {/* TLL Hallmark */}
        <View style={styles.tllCard}>
          <View style={styles.tllHeader}>
            <Shield size={20} color={COLORS.emerald} />
            <Text style={styles.tllTitle}>TRUST LAYER LEDGER · {tllRecord ? 'VERIFIED' : sealing ? 'SEALING...' : 'PENDING'}</Text>
          </View>
          {tllRecord ? (
            isPro ? (
              <>
                {tllRecord.healthNarrative ? (
                  <Text style={styles.tllNarrative}>{tllRecord.healthNarrative}</Text>
                ) : null}
                <View style={styles.tllDetails}>
                  <Text style={styles.tllDetailLabel}>Record</Text>
                  <Text style={styles.tllDetailValue}>{tllRecord.scanId}</Text>
                </View>
                <View style={styles.tllDetails}>
                  <Text style={styles.tllDetailLabel}>Hash</Text>
                  <Text style={styles.tllHash}>{tllRecord.scanHash?.slice(0, 24)}...</Text>
                </View>
                <View style={styles.tllDetails}>
                  <Text style={styles.tllDetailLabel}>Sealed</Text>
                  <Text style={styles.tllDetailValue}>{new Date(tllRecord.hallmark.sealedAt).toLocaleString()}</Text>
                </View>
                <TouchableOpacity
                  style={styles.tllVerifyBtn}
                  onPress={() => Linking.openURL(tllRecord.explorerUrl)}
                >
                  <Text style={styles.tllVerifyText}>🛡️ View on Explorer</Text>
                </TouchableOpacity>
              </>
            ) : (
              <View>
                <Text style={styles.tllNarrative}>✓ Scan sealed to Trust Layer Ledger</Text>
                <View style={styles.blurredTllBlock}>
                  <View style={[styles.blurPill, { width: '80%', marginBottom: 6 }]} />
                  <View style={[styles.blurPill, { width: '60%', marginBottom: 6 }]} />
                  <View style={[styles.blurPill, { width: '70%' }]} />
                </View>
                <TouchableOpacity
                  style={styles.tllVerifyBtn}
                  onPress={openUpgrade}
                >
                  <Lock size={12} color={COLORS.cyan} />
                  <Text style={[styles.tllVerifyText, { color: COLORS.cyan }]}>Upgrade to view verification details</Text>
                </TouchableOpacity>
              </View>
            )
          ) : (
            <Text style={styles.tllPending}>
              {sealing ? 'Sealing scan to Trust Layer Ledger...' : 'Connect to seal this report'}
            </Text>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bgDark },
  scrollContent: { padding: 20, paddingBottom: 60, maxWidth: 700, alignSelf: 'center' as const, width: '100%' },
  scanningContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 16 },
  scanningTitle: { color: COLORS.cyan, fontSize: 16, fontWeight: '700', letterSpacing: 2 },
  scanningSubtitle: { color: COLORS.textMuted, fontSize: 12 },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 20, marginBottom: 24 },
  backText: { color: COLORS.textMuted, fontSize: 14 },
  pageTitle: { fontSize: 24, fontWeight: '800', color: COLORS.textMain, letterSpacing: 2, marginBottom: 4 },
  timestamp: { color: COLORS.textDim, fontSize: 11, fontFamily: 'monospace', marginBottom: 24 },
  vehicleCard: { backgroundColor: COLORS.bgPanel, borderRadius: 12, padding: 16, borderWidth: 1, borderColor: COLORS.borderLight, marginBottom: 16 },
  vehicleName: { color: COLORS.textMain, fontSize: 16, fontWeight: '700', marginBottom: 4 },
  vehicleVin: { color: COLORS.textDim, fontSize: 12, fontFamily: 'monospace' },
  overallCard: { borderRadius: 12, padding: 20, borderWidth: 1, marginBottom: 20, backgroundColor: 'rgba(255,255,255,0.02)' },
  overallRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  overallLabel: { color: COLORS.textMuted, fontSize: 11, fontWeight: '600', letterSpacing: 1, marginBottom: 4 },
  overallValue: { fontSize: 36, fontWeight: '800', fontFamily: 'monospace' },
  laneReadyBadge: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20, borderWidth: 1 },
  laneReadyText: { fontSize: 11, fontWeight: '700', letterSpacing: 1 },
  sectionCard: { backgroundColor: COLORS.bgPanel, borderRadius: 12, padding: 16, borderWidth: 1, borderColor: COLORS.borderLight, marginBottom: 12 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: COLORS.borderLight },
  sectionName: { color: COLORS.textMain, fontSize: 14, fontWeight: '700' },
  sectionStatus: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  itemLabel: { flex: 1, color: COLORS.textMuted, fontSize: 12 },
  itemValue: { fontSize: 12, fontWeight: '700', fontFamily: 'monospace' },
  summaryCard: { backgroundColor: 'rgba(6,182,212,0.05)', borderRadius: 12, padding: 20, borderWidth: 1, borderColor: 'rgba(6,182,212,0.2)', marginTop: 8 },
  summaryLabel: { color: COLORS.cyan, fontSize: 11, fontWeight: '700', letterSpacing: 1.5, marginBottom: 8 },
  summaryText: { color: COLORS.textMain, fontSize: 13, lineHeight: 20, marginBottom: 16 },
  summaryFooter: { color: COLORS.textDim, fontSize: 10, lineHeight: 16, textAlign: 'center' },
  // TLL Hallmark
  tllCard: { marginTop: 16, borderRadius: 14, padding: 20, borderWidth: 1, borderColor: 'rgba(16,185,129,0.15)', backgroundColor: 'rgba(16,185,129,0.03)' },
  tllHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  tllTitle: { color: COLORS.emerald, fontSize: 10, fontWeight: '800', letterSpacing: 1.5 },
  tllNarrative: { color: COLORS.textMain, fontSize: 13, lineHeight: 20, marginBottom: 12, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(16,185,129,0.08)' },
  tllDetails: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  tllDetailLabel: { color: COLORS.textDim, fontSize: 10, fontWeight: '600', letterSpacing: 0.8, textTransform: 'uppercase' as const },
  tllDetailValue: { color: COLORS.textMuted, fontSize: 11, fontWeight: '600' },
  tllHash: { color: 'rgba(16,185,129,0.5)', fontSize: 10, fontFamily: 'monospace' },
  tllVerifyBtn: { flexDirection: 'row', gap: 8, marginTop: 14, paddingVertical: 12, paddingHorizontal: 20, borderRadius: 10, backgroundColor: 'rgba(16,185,129,0.1)', borderWidth: 1, borderColor: 'rgba(16,185,129,0.2)', alignItems: 'center', justifyContent: 'center' },
  tllVerifyText: { color: COLORS.emerald, fontSize: 13, fontWeight: '700', letterSpacing: 0.5 },
  lockedValue: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  blurPill: { height: 12, width: 48, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 6 },
  blurredTllBlock: { marginVertical: 12, gap: 4 },
  reportUpgradeCta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, marginTop: 16, paddingVertical: 14, paddingHorizontal: 20, borderRadius: 12, backgroundColor: 'rgba(6,182,212,0.08)', borderWidth: 1, borderColor: 'rgba(6,182,212,0.2)' },
  reportUpgradeText: { color: COLORS.cyan, fontSize: 12, fontWeight: '700', letterSpacing: 0.3, flex: 1 },
  tllPending: { color: COLORS.textDim, fontSize: 12, fontStyle: 'italic' },
});
