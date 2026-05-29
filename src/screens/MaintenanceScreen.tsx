/**
 * LumeScan — Maintenance Screen
 * ================================
 * Oil life hero ring, service status grid, predictive section (Pro-only),
 * service history, and custom service item creation.
 * Non-critical advisory layer — does NOT touch the deterministic engine.
 *
 * DarkWave Studios LLC — Copyright 2026
 */

import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView, ScrollView,
  TouchableOpacity, Alert, Dimensions, TextInput, Modal,
} from 'react-native';
import {
  Wrench, Droplets, RotateCcw, Disc, Wind, Thermometer, Cog,
  Plus, Clock, CheckCircle, AlertTriangle, XCircle, ChevronDown,
  Lock, History,
} from 'lucide-react-native';
import { COLORS } from '../theme/colors';
import type { Tier } from '../config/entitlement';
import {
  loadMaintenanceState, saveMaintenanceState, resetServiceItem,
  addCustomItem, getItemStatus, getMilesRemaining, getDaysRemaining,
  getProgressPct, loadHistory,
  type MaintenanceState, type MaintenanceItem, type ServiceHistoryEntry, type ServiceStatus,
} from '../data/MaintenanceStore';

const { width } = Dimensions.get('window');
const isTablet = width >= 600;
const COLUMNS = isTablet ? 3 : 2;
const CARD_WIDTH = isTablet
  ? (Math.min(width, 700) - 40 - 12 * (COLUMNS - 1)) / COLUMNS
  : (width - 40 - 12) / 2;

const ICONS: Record<string, any> = {
  Droplets, RotateCcw, Disc, Wind, Thermometer, Cog, Wrench,
};

const STATUS_COLORS: Record<ServiceStatus, string> = {
  good: COLORS.emerald,
  upcoming: '#f59e0b',
  due: '#ef4444',
  overdue: '#ef4444',
};

const STATUS_LABELS: Record<ServiceStatus, string> = {
  good: '✅ Good',
  upcoming: '🔶 Upcoming',
  due: '🔴 Due',
  overdue: '🔴 Overdue',
};

interface Props {
  tier: Tier;
}

export default function MaintenanceScreen({ tier }: Props) {
  const [state, setState] = useState<MaintenanceState | null>(null);
  const [history, setHistory] = useState<ServiceHistoryEntry[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [customName, setCustomName] = useState('');
  const [customMiles, setCustomMiles] = useState('');
  const [customDays, setCustomDays] = useState('');
  const isPro = tier === 'pro';

  useEffect(() => {
    (async () => {
      const s = await loadMaintenanceState();
      setState(s);
      const h = await loadHistory();
      setHistory(h);
    })();
  }, []);

  if (!state) return null;

  const oilLifeColor = state.oilLifePct > 50 ? COLORS.emerald : state.oilLifePct > 25 ? '#f59e0b' : '#ef4444';

  const handleReset = (item: MaintenanceItem) => {
    Alert.alert(
      `Reset ${item.label}?`,
      `Mark ${item.label.toLowerCase()} as completed today. This resets the counter and records it in your service history.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Mark Complete',
          onPress: async () => {
            const updated = await resetServiceItem(state, item.id);
            setState(updated);
            const h = await loadHistory();
            setHistory(h);
          },
        },
      ]
    );
  };

  const handleAddCustom = async () => {
    if (!customName.trim() || !customMiles) {
      Alert.alert('Missing Info', 'Name and mile interval are required.');
      return;
    }
    const updated = addCustomItem(state, customName.trim(), parseInt(customMiles) || 5000, parseInt(customDays) || 365);
    await saveMaintenanceState(updated);
    setState(updated);
    setShowAddModal(false);
    setCustomName('');
    setCustomMiles('');
    setCustomDays('');
  };

  // Sort: overdue first, then due, upcoming, good
  const sortedItems = [...state.items].sort((a, b) => {
    const order: Record<ServiceStatus, number> = { overdue: 0, due: 1, upcoming: 2, good: 3 };
    return order[getItemStatus(a)] - order[getItemStatus(b)];
  });

  const dueCount = state.items.filter(i => {
    const s = getItemStatus(i);
    return s === 'due' || s === 'overdue';
  }).length;

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Wrench size={22} color={COLORS.cyan} />
            <Text style={styles.headerTitle}>Maintenance</Text>
          </View>
          {dueCount > 0 && (
            <View style={styles.dueBadge}>
              <Text style={styles.dueText}>{dueCount} DUE</Text>
            </View>
          )}
        </View>

        {/* Oil Life Hero */}
        <View style={styles.oilHeroCard}>
          <View style={styles.oilRingContainer}>
            <View style={[styles.oilRingBg]} />
            <View style={[styles.oilRingFill, {
              borderColor: oilLifeColor,
              borderTopColor: 'transparent',
              borderRightColor: state.oilLifePct > 25 ? oilLifeColor : 'transparent',
              borderBottomColor: state.oilLifePct > 50 ? oilLifeColor : 'transparent',
              borderLeftColor: state.oilLifePct > 75 ? oilLifeColor : 'transparent',
            }]} />
            <View style={styles.oilRingCenter}>
              <Droplets size={20} color={oilLifeColor} />
              <Text style={[styles.oilPct, { color: oilLifeColor }]}>{Math.round(state.oilLifePct)}%</Text>
              <Text style={styles.oilLabel}>OIL LIFE</Text>
            </View>
          </View>
          <View style={styles.oilInfoCol}>
            <Text style={styles.oilInfoTitle}>Engine Oil</Text>
            <Text style={styles.oilInfoSub}>
              Est. {Math.round(state.oilLifePct * 50)} miles remaining
            </Text>
            {state.oilLifePct < 25 && (
              <View style={styles.oilWarning}>
                <AlertTriangle size={12} color="#ef4444" />
                <Text style={styles.oilWarningText}>Service soon</Text>
              </View>
            )}
          </View>
        </View>

        {/* Predictive section — Pro only */}
        {isPro ? (
          <View style={styles.predictiveCard}>
            <Text style={styles.predictiveTitle}>PREDICTIVE ESTIMATE</Text>
            <Text style={styles.predictiveText}>
              Based on your driving pattern, oil life is declining at ~0.4%/day.
              Service window: <Text style={{ color: COLORS.cyan, fontWeight: '700' }}>
                {Math.round(state.oilLifePct * 40)}–{Math.round(state.oilLifePct * 55)} miles
              </Text>
            </Text>
          </View>
        ) : (
          <TouchableOpacity
            style={styles.predictiveLocked}
            onPress={() => Alert.alert('Pro Feature', 'Predictive maintenance estimates are available with LumeScan Pro.', [
              { text: 'Learn More', onPress: () => {} },
              { text: 'Upgrade', onPress: () => {} },
            ])}
          >
            <Lock size={14} color={COLORS.cyan} />
            <Text style={styles.predictiveLockedText}>Predictive estimates — Pro only</Text>
          </TouchableOpacity>
        )}

        {/* Service Status Grid */}
        <Text style={styles.sectionTitle}>SERVICE STATUS</Text>
        <View style={styles.grid}>
          {sortedItems.map(item => {
            const status = getItemStatus(item);
            const pct = getProgressPct(item);
            const milesLeft = getMilesRemaining(item);
            const daysLeft = getDaysRemaining(item);
            const color = STATUS_COLORS[status];
            const IconComp = ICONS[item.iconName] || Wrench;

            return (
              <View key={item.id} style={[styles.card, { borderColor: status === 'good' ? COLORS.borderLight : `${color}33` }]}>
                <View style={styles.cardHeader}>
                  <IconComp size={16} color={color} />
                  <Text style={styles.cardTitle} numberOfLines={1}>{item.label}</Text>
                </View>

                {/* Progress bar */}
                <View style={styles.progressBg}>
                  <View style={[styles.progressFill, { width: `${Math.min(100, pct * 100)}%`, backgroundColor: color }]} />
                </View>

                <Text style={styles.cardMiles}>
                  {item.currentMiles.toLocaleString()} / {item.intervalMiles.toLocaleString()} mi
                </Text>

                <View style={styles.cardStatusRow}>
                  <Text style={[styles.cardStatus, { color }]}>{STATUS_LABELS[status]}</Text>
                  <Text style={styles.cardDays}>{daysLeft}d left</Text>
                </View>

                {/* Reset button */}
                <TouchableOpacity
                  style={[styles.resetBtn, { borderColor: `${color}33` }]}
                  onPress={() => handleReset(item)}
                  activeOpacity={0.7}
                >
                  <CheckCircle size={12} color={color} />
                  <Text style={[styles.resetText, { color }]}>Mark Complete</Text>
                </TouchableOpacity>
              </View>
            );
          })}
        </View>

        {/* Add Custom */}
        <TouchableOpacity style={styles.addBtn} onPress={() => setShowAddModal(true)} activeOpacity={0.7}>
          <Plus size={18} color={COLORS.cyan} />
          <Text style={styles.addBtnText}>Add Custom Service Item</Text>
        </TouchableOpacity>

        {/* Service History */}
        <TouchableOpacity
          style={styles.historyToggle}
          onPress={() => setShowHistory(!showHistory)}
          activeOpacity={0.7}
        >
          <History size={16} color={COLORS.textMuted} />
          <Text style={styles.historyToggleText}>Service History ({history.length})</Text>
          <ChevronDown size={14} color={COLORS.textDim} style={showHistory ? { transform: [{ rotate: '180deg' }] } : undefined} />
        </TouchableOpacity>

        {showHistory && (
          <View style={styles.historyList}>
            {history.length === 0 ? (
              <Text style={styles.historyEmpty}>No service history yet. Mark a service as complete to start tracking.</Text>
            ) : (
              history.slice(0, 20).map((entry, i) => (
                <View key={entry.id || i} style={styles.historyRow}>
                  <CheckCircle size={12} color={COLORS.emerald} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.historyLabel}>{entry.itemLabel}</Text>
                    <Text style={styles.historyDate}>{new Date(entry.date).toLocaleDateString()} · {entry.mileage.toLocaleString()} mi</Text>
                  </View>
                </View>
              ))
            )}
          </View>
        )}

        <Text style={styles.disclaimer}>
          Maintenance counters are advisory only — they do not enter the certified event engine or anchor to the Trust Layer Ledger. Store locally on device.
        </Text>
      </ScrollView>

      {/* Add Custom Modal */}
      <Modal visible={showAddModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Add Custom Service</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Service name (e.g., Spark Plugs)"
              placeholderTextColor={COLORS.textDim}
              value={customName}
              onChangeText={setCustomName}
            />
            <TextInput
              style={styles.modalInput}
              placeholder="Mile interval (e.g., 30000)"
              placeholderTextColor={COLORS.textDim}
              value={customMiles}
              onChangeText={setCustomMiles}
              keyboardType="numeric"
            />
            <TextInput
              style={styles.modalInput}
              placeholder="Day interval (e.g., 365)"
              placeholderTextColor={COLORS.textDim}
              value={customDays}
              onChangeText={setCustomDays}
              keyboardType="numeric"
            />
            <View style={styles.modalBtns}>
              <TouchableOpacity style={styles.modalCancel} onPress={() => setShowAddModal(false)}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalSave} onPress={handleAddCustom}>
                <Text style={styles.modalSaveText}>Add</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bgDark },
  scrollContent: { padding: 20, paddingTop: 60, paddingBottom: 40, maxWidth: 700, alignSelf: 'center' as const, width: '100%' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerTitle: { color: COLORS.textMain, fontSize: 20, fontWeight: '800' },
  dueBadge: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(239,68,68,0.3)', backgroundColor: 'rgba(239,68,68,0.06)' },
  dueText: { color: '#ef4444', fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  sectionTitle: { fontSize: 11, color: COLORS.textMuted, fontWeight: '700', letterSpacing: 1.5, marginBottom: 12, marginTop: 16 },
  // Oil Hero
  oilHeroCard: {
    flexDirection: 'row', alignItems: 'center', gap: 20,
    backgroundColor: COLORS.bgPanel, borderRadius: 16, padding: 20,
    borderWidth: 1, borderColor: COLORS.borderLight, marginBottom: 12,
  },
  oilRingContainer: { width: 90, height: 90, alignItems: 'center', justifyContent: 'center' },
  oilRingBg: {
    position: 'absolute', width: 90, height: 90, borderRadius: 45,
    borderWidth: 4, borderColor: 'rgba(255,255,255,0.06)',
  },
  oilRingFill: {
    position: 'absolute', width: 90, height: 90, borderRadius: 45,
    borderWidth: 4, transform: [{ rotate: '-45deg' }],
  },
  oilRingCenter: { alignItems: 'center' },
  oilPct: { fontSize: 20, fontWeight: '900', fontFamily: 'monospace', marginTop: 2 },
  oilLabel: { fontSize: 7, color: COLORS.textDim, fontWeight: '700', letterSpacing: 1.5, marginTop: 1 },
  oilInfoCol: { flex: 1 },
  oilInfoTitle: { color: COLORS.textMain, fontSize: 16, fontWeight: '700' },
  oilInfoSub: { color: COLORS.textMuted, fontSize: 12, marginTop: 4 },
  oilWarning: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 },
  oilWarningText: { color: '#ef4444', fontSize: 11, fontWeight: '700' },
  // Predictive
  predictiveCard: {
    backgroundColor: 'rgba(6,182,212,0.04)', borderRadius: 12, padding: 14,
    borderWidth: 1, borderColor: 'rgba(6,182,212,0.12)', marginBottom: 8,
  },
  predictiveTitle: { fontSize: 9, color: COLORS.cyan, fontWeight: '700', letterSpacing: 1.5, marginBottom: 6 },
  predictiveText: { color: COLORS.textMuted, fontSize: 12, lineHeight: 18 },
  predictiveLocked: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 12, borderRadius: 10, backgroundColor: 'rgba(6,182,212,0.04)',
    borderWidth: 1, borderColor: 'rgba(6,182,212,0.1)', marginBottom: 8,
  },
  predictiveLockedText: { color: COLORS.textDim, fontSize: 11, fontWeight: '600' },
  // Grid
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, justifyContent: 'space-between' },
  card: {
    width: CARD_WIDTH, backgroundColor: COLORS.bgPanel, borderRadius: 12, padding: 14,
    borderWidth: 1, overflow: 'hidden',
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  cardTitle: { color: COLORS.textMain, fontSize: 12, fontWeight: '700', flex: 1 },
  progressBg: { height: 4, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 2, marginBottom: 8, overflow: 'hidden' },
  progressFill: { height: 4, borderRadius: 2 },
  cardMiles: { color: COLORS.textMuted, fontSize: 10, fontFamily: 'monospace', marginBottom: 6 },
  cardStatusRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  cardStatus: { fontSize: 10, fontWeight: '700' },
  cardDays: { fontSize: 9, color: COLORS.textDim, fontWeight: '600' },
  resetBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 8, borderRadius: 8, borderWidth: 1, backgroundColor: 'rgba(255,255,255,0.02)',
  },
  resetText: { fontSize: 10, fontWeight: '700' },
  // Add
  addBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 14, borderRadius: 12, borderWidth: 1, borderStyle: 'dashed',
    borderColor: 'rgba(6,182,212,0.2)', marginTop: 16,
  },
  addBtnText: { color: COLORS.cyan, fontSize: 12, fontWeight: '700' },
  // History
  historyToggle: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingVertical: 14, marginTop: 16,
  },
  historyToggleText: { flex: 1, color: COLORS.textMuted, fontSize: 13, fontWeight: '600' },
  historyList: {
    backgroundColor: COLORS.bgPanel, borderRadius: 12, padding: 14,
    borderWidth: 1, borderColor: COLORS.borderLight,
  },
  historyEmpty: { color: COLORS.textDim, fontSize: 12, textAlign: 'center', paddingVertical: 12, fontStyle: 'italic' },
  historyRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: COLORS.borderLight },
  historyLabel: { color: COLORS.textMain, fontSize: 13, fontWeight: '600' },
  historyDate: { color: COLORS.textDim, fontSize: 10, marginTop: 2 },
  disclaimer: { fontSize: 10, color: COLORS.textDim, textAlign: 'center', marginTop: 24, lineHeight: 16 },
  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  modalCard: { backgroundColor: COLORS.bgPanelSolid, borderRadius: 16, padding: 24, width: '100%', maxWidth: 360, borderWidth: 1, borderColor: COLORS.borderLight },
  modalTitle: { color: COLORS.textMain, fontSize: 18, fontWeight: '800', marginBottom: 16 },
  modalInput: {
    backgroundColor: 'rgba(0,0,0,0.4)', borderWidth: 1, borderColor: COLORS.borderLight,
    borderRadius: 10, padding: 14, color: COLORS.textMain, fontSize: 14, marginBottom: 12,
  },
  modalBtns: { flexDirection: 'row', gap: 10, marginTop: 8 },
  modalCancel: { flex: 1, paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: COLORS.borderLight, alignItems: 'center' },
  modalCancelText: { color: COLORS.textMuted, fontSize: 13, fontWeight: '600' },
  modalSave: { flex: 1, paddingVertical: 12, borderRadius: 10, backgroundColor: COLORS.cyan, alignItems: 'center' },
  modalSaveText: { color: '#000', fontSize: 13, fontWeight: '800' },
});
