import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, SafeAreaView, ScrollView, TouchableOpacity } from 'react-native';
import { CheckCircle, AlertTriangle, XCircle, ArrowLeft, Activity } from 'lucide-react-native';
import { COLORS } from '../theme/colors';
import { generateConditionReport } from '../telemetry/SimulatedEngine';

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

export default function ConditionReportScreen({ onBack }: { onBack: () => void }) {
  const [report, setReport] = useState<ReturnType<typeof generateConditionReport> | null>(null);

  useEffect(() => {
    // Simulate 2-second scan delay
    const timer = setTimeout(() => {
      setReport(generateConditionReport());
    }, 2000);
    return () => clearTimeout(timer);
  }, []);

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

        <Text style={styles.pageTitle}>CONDITION REPORT</Text>
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
                <Text style={[styles.itemValue, { color: item.status === 'ok' ? COLORS.cyan : item.status === 'critical' ? '#ef4444' : '#f59e0b' }]}>
                  {item.value}
                </Text>
              </View>
            ))}
          </View>
        ))}

        {/* Summary */}
        <View style={styles.summaryCard}>
          <Text style={styles.summaryLabel}>DETERMINISTIC ASSESSMENT</Text>
          <Text style={styles.summaryText}>{report.summary}</Text>
          <Text style={styles.summaryFooter}>
            42 nodes scanned · 4 primitives · Zero AI calls{'\n'}
            US Provisional Patent 64/032,339
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bgDark },
  scrollContent: { padding: 20, paddingBottom: 60 },
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
});
