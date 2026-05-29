/**
 * LumeScan — DTC Code Reader & Clear Screen
 * ============================================
 * The #1 consumer use case: read and clear check engine lights.
 * Integrates Mode 03 (active DTCs), Mode 07 (pending), Mode 0A (permanent),
 * Mode 04 (clear), and the Axiom DTC registry for rich interpretations.
 * 
 * Free tier: code number visible, interpretation blurred.
 * Pro tier: full interpretation, severity, parts, affiliate links.
 *
 * DarkWave Studios LLC — Copyright 2026
 */

import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView, ScrollView,
  TouchableOpacity, Alert, ActivityIndicator, Dimensions, Linking, TextInput, Vibration,
} from 'react-native';
import {
  AlertTriangle, XCircle, CheckCircle, Trash2, RefreshCw,
  Search, Lock, ShoppingCart, ChevronDown, ChevronUp, Clock,
  ShieldCheck, Info,
} from 'lucide-react-native';
import { COLORS } from '../theme/colors';
import DTCRegistry from '../data/lumescan_dtc';
import { getWiFiStatus } from '../telemetry/WiFiConnector';
import { getBLENativeStatus } from '../telemetry/BLEConnector';
import type { Tier } from '../config/entitlement';
import type { FailureAlert } from './FailureAlertBanner';

const { width } = Dimensions.get('window');
const isTablet = width >= 600;

const AMAZON_TAG = 'garagebot-20';
const EBAY_CAMPAIGN = '5339140935';

interface DTCEntry {
  code: string;
  type: 'active' | 'pending' | 'permanent';
  alert?: FailureAlert;
}

interface Props {
  tier: Tier;
  onUpgrade?: () => void;
}

function lookupDTC(code: string): FailureAlert | undefined {
  const key = `dtc_${code.toLowerCase()}`;
  // @ts-ignore
  const jsonStr = DTCRegistry.responses?.[key];
  if (!jsonStr) return undefined;
  try {
    return JSON.parse(jsonStr) as FailureAlert;
  } catch {
    return undefined;
  }
}

export default function DTCScreen({ tier }: Props) {
  const [activeDTCs, setActiveDTCs] = useState<DTCEntry[]>([]);
  const [pendingDTCs, setPendingDTCs] = useState<DTCEntry[]>([]);
  const [permanentDTCs, setPermanentDTCs] = useState<DTCEntry[]>([]);
  const [scanning, setScanning] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [hasScanned, setHasScanned] = useState(false);
  const [expandedCode, setExpandedCode] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResult, setSearchResult] = useState<FailureAlert | null>(null);

  const isPro = tier === 'pro';
  const isSimulated = getWiFiStatus().isSimulated || getBLENativeStatus().isSimulated;
  const connected = getWiFiStatus().status === 'connected' || getBLENativeStatus().status === 'connected';

  // Demo mode DTCs
  const DEMO_ACTIVE = ['P0171', 'P0420'];
  const DEMO_PENDING = ['P0300'];
  const DEMO_PERMANENT: string[] = [];

  const handleScan = async () => {
    setScanning(true);
    setHasScanned(false);
    await new Promise(r => setTimeout(r, 2000)); // Simulated scan delay

    if (isSimulated || !connected) {
      // Demo mode
      setActiveDTCs(DEMO_ACTIVE.map(code => ({ code, type: 'active', alert: lookupDTC(code) })));
      setPendingDTCs(DEMO_PENDING.map(code => ({ code, type: 'pending', alert: lookupDTC(code) })));
      setPermanentDTCs(DEMO_PERMANENT.map(code => ({ code, type: 'permanent', alert: lookupDTC(code) })));
    } else {
      // Real adapter — check BLE first, fall back to WiFi
      try {
        const ble = require('../telemetry/BLEConnector');
        const wifi = require('../telemetry/WiFiConnector');
        const bleConnected = ble.getBLENativeStatus().status === 'connected';
        const wifiConnected = wifi.getWiFiStatus().status === 'connected' && !wifi.getWiFiStatus().isSimulated;

        let active: string[] = [];
        let pending: string[] = [];
        let permanent: string[] = [];

        if (bleConnected) {
          // BLE adapter — Mode 03, 07, 0A
          active = await ble.readDTCs();
          pending = await ble.readPendingDTCs();
          permanent = await ble.readPermanentDTCs();
        } else if (wifiConnected) {
          // WiFi adapter — Mode 03, 07, 0A
          active = await wifi.readDTCsWiFi();
          pending = await wifi.readPendingDTCsWiFi();
          permanent = await wifi.readPermanentDTCsWiFi();
        }

        setActiveDTCs(active.map((code: string) => ({ code, type: 'active', alert: lookupDTC(code) })));
        setPendingDTCs(pending.map((code: string) => ({ code, type: 'pending', alert: lookupDTC(code) })));
        setPermanentDTCs(permanent.map((code: string) => ({ code, type: 'permanent', alert: lookupDTC(code) })));
      } catch (e) {
        Alert.alert('Scan Error', 'Failed to read DTCs from vehicle. Check adapter connection.');
      }
    }
    setScanning(false);
    setHasScanned(true);
    Vibration.vibrate(100);
  };

  const handleClear = () => {
    Alert.alert(
      'Clear All Codes',
      'This will clear all stored diagnostic trouble codes and turn off the check engine light.\n\nDrive cycle monitors will be reset. You may need to drive 50-100 miles before an emissions inspection.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear Codes',
          style: 'destructive',
          onPress: async () => {
            setClearing(true);
            await new Promise(r => setTimeout(r, 2500));
            if (!isSimulated && connected) {
              try {
                const ble = require('../telemetry/BLEConnector');
                const wifi = require('../telemetry/WiFiConnector');
                const bleConnected = ble.getBLENativeStatus().status === 'connected';
                const wifiConnected = wifi.getWiFiStatus().status === 'connected' && !wifi.getWiFiStatus().isSimulated;

                let result: { success: boolean; message: string } | null = null;
                if (bleConnected) {
                  result = await ble.clearDTCs();
                } else if (wifiConnected) {
                  result = await wifi.clearDTCsWiFi();
                }
                if (result && !result.success) {
                  Alert.alert('Clear Failed', result.message);
                  setClearing(false);
                  return;
                }
              } catch { /* handled below */ }
            }
            setActiveDTCs([]);
            setPendingDTCs([]);
            setClearing(false);
            Vibration.vibrate([0, 200, 100, 200]);
            Alert.alert('✓ Codes Cleared', 'All trouble codes have been cleared. Check engine light should turn off. Drive 50-100 miles to complete readiness monitors for emissions testing.');
          },
        },
      ]
    );
  };

  const handleSearch = () => {
    const code = searchQuery.trim().toUpperCase();
    if (!code || code.length < 4) {
      setSearchResult(null);
      return;
    }
    const result = lookupDTC(code);
    if (result) {
      setSearchResult({ ...result, code });
    } else {
      setSearchResult(null);
      Alert.alert('Code Not Found', `${code} is not in the LumeScan database. This may be a manufacturer-specific code.`);
    }
  };

  const totalDTCs = activeDTCs.length + pendingDTCs.length + permanentDTCs.length;

  const renderDTCCard = (dtc: DTCEntry) => {
    const isActive = dtc.type === 'active';
    const isPending = dtc.type === 'pending';
    const expanded = expandedCode === `${dtc.type}_${dtc.code}`;
    const color = isActive ? '#ef4444' : isPending ? '#f59e0b' : COLORS.textDim;
    const bgColor = isActive ? 'rgba(239,68,68,0.06)' : isPending ? 'rgba(245,158,11,0.06)' : 'rgba(255,255,255,0.02)';
    const borderColor = isActive ? 'rgba(239,68,68,0.2)' : isPending ? 'rgba(245,158,11,0.2)' : COLORS.borderLight;
    const Icon = isActive ? XCircle : isPending ? AlertTriangle : Info;
    const typeLabel = isActive ? 'ACTIVE' : isPending ? 'PENDING' : 'PERMANENT';

    return (
      <TouchableOpacity
        key={`${dtc.type}_${dtc.code}`}
        style={[styles.dtcCard, { backgroundColor: bgColor, borderColor }]}
        onPress={() => setExpandedCode(expanded ? null : `${dtc.type}_${dtc.code}`)}
        activeOpacity={0.7}
      >
        {/* Header row — always visible */}
        <View style={styles.dtcHeader}>
          <Icon size={18} color={color} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.dtcCode, { color }]}>{dtc.code}</Text>
            <Text style={styles.dtcType}>{typeLabel}</Text>
          </View>
          {dtc.alert?.system && (
            <Text style={styles.dtcSystem}>{dtc.alert.system}</Text>
          )}
          {expanded ? <ChevronUp size={16} color={COLORS.textDim} /> : <ChevronDown size={16} color={COLORS.textDim} />}
        </View>

        {/* Expanded detail — Pro or blurred */}
        {expanded && dtc.alert && (
          <View style={styles.dtcDetail}>
            {isPro ? (
              <>
                <Text style={styles.dtcInterpretation}>{dtc.alert.interpretation}</Text>
                <View style={styles.dtcMetaRow}>
                  <Text style={styles.dtcMetaLabel}>Severity</Text>
                  <Text style={styles.dtcMetaValue}>{dtc.alert.severity}</Text>
                </View>
                {dtc.alert.timeline && (
                  <View style={styles.dtcMetaRow}>
                    <Text style={styles.dtcMetaLabel}>Timeline</Text>
                    <Text style={[styles.dtcMetaValue, { color }]}>{dtc.alert.timeline}</Text>
                  </View>
                )}
                <View style={styles.dtcMetaRow}>
                  <Text style={styles.dtcMetaLabel}>Action</Text>
                  <Text style={styles.dtcMetaValue}>{dtc.alert.action}</Text>
                </View>
                {/* Affiliate links */}
                <View style={styles.partLinks}>
                  <TouchableOpacity
                    style={[styles.partBtn, styles.amazonBtn]}
                    onPress={() => {
                      const q = encodeURIComponent(`${dtc.alert!.partName} ${dtc.alert!.vehicle || ''}`);
                      Linking.openURL(`https://www.amazon.com/s?k=${q}&i=automotive&tag=${AMAZON_TAG}`);
                    }}
                  >
                    <ShoppingCart size={12} color="#ff9900" />
                    <Text style={styles.amazonText}>Amazon — ${dtc.alert.partPriceLow}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.partBtn, styles.ebayBtn]}
                    onPress={() => {
                      const q = encodeURIComponent(`${dtc.alert!.partName} ${dtc.alert!.vehicle || ''}`);
                      Linking.openURL(`https://www.ebay.com/sch/i.html?_nkw=${q}&_sacat=6000&mkcid=1&mkrid=711-53200-19255-0&campid=${EBAY_CAMPAIGN}&toolid=10001`);
                    }}
                  >
                    <ShoppingCart size={12} color="#0064d2" />
                    <Text style={styles.ebayText}>eBay — ${dtc.alert.partPriceHigh > dtc.alert.partPriceLow ? dtc.alert.partPriceLow : dtc.alert.partPriceHigh}</Text>
                  </TouchableOpacity>
                </View>
              </>
            ) : (
              <>
                {/* Blurred content for free */}
                <View style={styles.blurredBlock}>
                  <View style={[styles.blurBar, { width: '90%' }]} />
                  <View style={[styles.blurBar, { width: '75%' }]} />
                  <View style={[styles.blurBar, { width: '60%' }]} />
                </View>
                <View style={styles.dtcMetaRow}>
                  <Text style={styles.dtcMetaLabel}>Severity</Text>
                  <View style={styles.blurPill} />
                </View>
                <TouchableOpacity
                  style={styles.dtcUpgradeBtn}
                  onPress={() => Linking.openURL('https://lumeauto.tech/order')}
                >
                  <Lock size={12} color={COLORS.cyan} />
                  <Text style={styles.dtcUpgradeText}>Upgrade to Pro for full diagnosis + parts</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <AlertTriangle size={22} color="#f59e0b" />
            <Text style={styles.headerTitle}>Trouble Codes</Text>
          </View>
          {hasScanned && (
            <View style={[styles.countBadge, { borderColor: totalDTCs > 0 ? 'rgba(239,68,68,0.3)' : 'rgba(16,185,129,0.3)', backgroundColor: totalDTCs > 0 ? 'rgba(239,68,68,0.06)' : 'rgba(16,185,129,0.06)' }]}>
              <Text style={[styles.countText, { color: totalDTCs > 0 ? '#ef4444' : COLORS.emerald }]}>
                {totalDTCs > 0 ? `${totalDTCs} CODE${totalDTCs > 1 ? 'S' : ''}` : 'ALL CLEAR'}
              </Text>
            </View>
          )}
        </View>

        {/* DTC Encyclopedia Search */}
        <Text style={styles.sectionTitle}>DTC ENCYCLOPEDIA</Text>
        <View style={styles.searchRow}>
          <TextInput
            style={styles.searchInput}
            placeholder="Search any code (P0420, C1234...)"
            placeholderTextColor={COLORS.textDim}
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoCapitalize="characters"
            onSubmitEditing={handleSearch}
          />
          <TouchableOpacity style={styles.searchBtn} onPress={handleSearch}>
            <Search size={18} color="#000" />
          </TouchableOpacity>
        </View>
        {searchResult && (
          <View style={[styles.dtcCard, { backgroundColor: 'rgba(6,182,212,0.04)', borderColor: 'rgba(6,182,212,0.2)' }]}>
            <View style={styles.dtcHeader}>
              <Info size={18} color={COLORS.cyan} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.dtcCode, { color: COLORS.cyan }]}>{searchResult.code}</Text>
                <Text style={styles.dtcType}>ENCYCLOPEDIA</Text>
              </View>
              <Text style={styles.dtcSystem}>{searchResult.system}</Text>
            </View>
            <View style={styles.dtcDetail}>
              {isPro ? (
                <>
                  <Text style={styles.dtcInterpretation}>{searchResult.interpretation}</Text>
                  <View style={styles.dtcMetaRow}>
                    <Text style={styles.dtcMetaLabel}>Severity</Text>
                    <Text style={styles.dtcMetaValue}>{searchResult.severity}</Text>
                  </View>
                  <View style={styles.dtcMetaRow}>
                    <Text style={styles.dtcMetaLabel}>Action</Text>
                    <Text style={styles.dtcMetaValue}>{searchResult.action}</Text>
                  </View>
                </>
              ) : (
                <>
                  <View style={styles.blurredBlock}>
                    <View style={[styles.blurBar, { width: '85%' }]} />
                    <View style={[styles.blurBar, { width: '70%' }]} />
                  </View>
                  <TouchableOpacity style={styles.dtcUpgradeBtn} onPress={() => Linking.openURL('https://lumeauto.tech/order')}>
                    <Lock size={12} color={COLORS.cyan} />
                    <Text style={styles.dtcUpgradeText}>Upgrade to Pro for interpretation</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          </View>
        )}

        {/* Scan Button */}
        <Text style={styles.sectionTitle}>VEHICLE SCAN</Text>
        <TouchableOpacity
          style={[styles.scanBtn, scanning && styles.scanBtnDisabled]}
          onPress={handleScan}
          disabled={scanning}
          activeOpacity={0.7}
        >
          {scanning ? (
            <ActivityIndicator color="#000" />
          ) : (
            <RefreshCw size={20} color="#000" />
          )}
          <Text style={styles.scanBtnText}>
            {scanning ? 'SCANNING...' : hasScanned ? 'SCAN AGAIN' : 'READ TROUBLE CODES'}
          </Text>
        </TouchableOpacity>

        {/* Results */}
        {hasScanned && (
          <>
            {totalDTCs === 0 ? (
              <View style={styles.allClearCard}>
                <CheckCircle size={40} color={COLORS.emerald} />
                <Text style={styles.allClearTitle}>No Trouble Codes Found</Text>
                <Text style={styles.allClearSub}>Your vehicle has no stored, pending, or permanent diagnostic trouble codes. The check engine light should be off.</Text>
              </View>
            ) : (
              <>
                {/* Active DTCs */}
                {activeDTCs.length > 0 && (
                  <>
                    <Text style={styles.sectionTitle}>🔴 ACTIVE CODES — {activeDTCs.length}</Text>
                    {activeDTCs.map(renderDTCCard)}
                  </>
                )}

                {/* Pending DTCs */}
                {pendingDTCs.length > 0 && (
                  <>
                    <Text style={styles.sectionTitle}>🟡 PENDING CODES — {pendingDTCs.length}</Text>
                    <Text style={styles.sectionSubtitle}>These codes haven't triggered the check engine light yet but may soon.</Text>
                    {pendingDTCs.map(renderDTCCard)}
                  </>
                )}

                {/* Permanent DTCs */}
                {permanentDTCs.length > 0 && (
                  <>
                    <Text style={styles.sectionTitle}>⚫ PERMANENT CODES — {permanentDTCs.length}</Text>
                    <Text style={styles.sectionSubtitle}>These cannot be cleared — they require the underlying problem to be fixed and drive cycles to complete.</Text>
                    {permanentDTCs.map(renderDTCCard)}
                  </>
                )}

                {/* Clear button */}
                {(activeDTCs.length > 0 || pendingDTCs.length > 0) && (
                  <TouchableOpacity
                    style={[styles.clearBtn, clearing && { opacity: 0.5 }]}
                    onPress={handleClear}
                    disabled={clearing}
                    activeOpacity={0.7}
                  >
                    {clearing ? (
                      <ActivityIndicator color="#ef4444" />
                    ) : (
                      <Trash2 size={18} color="#ef4444" />
                    )}
                    <Text style={styles.clearBtnText}>
                      {clearing ? 'CLEARING...' : 'CLEAR ALL CODES'}
                    </Text>
                  </TouchableOpacity>
                )}
              </>
            )}
          </>
        )}

        <Text style={styles.disclaimer}>
          Mode 03: Active DTCs · Mode 07: Pending DTCs · Mode 0A: Permanent DTCs · Mode 04: Clear{'\n'}
          Permanent codes (Mode 0A) cannot be cleared — they require repair + drive cycles.{'\n'}
          42 Nodes · Deterministic · US Patent 64/032,339
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
  countBadge: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12, borderWidth: 1 },
  countText: { fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  sectionTitle: { fontSize: 11, color: COLORS.textMuted, fontWeight: '700', letterSpacing: 1.5, marginBottom: 8, marginTop: 16 },
  sectionSubtitle: { fontSize: 11, color: COLORS.textDim, marginBottom: 10, marginTop: -4, lineHeight: 16 },
  // Search
  searchRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  searchInput: {
    flex: 1, backgroundColor: 'rgba(255,255,255,0.03)', borderWidth: 1, borderColor: COLORS.borderLight,
    borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, color: COLORS.textMain,
    fontSize: 14, fontFamily: 'monospace', letterSpacing: 1,
  },
  searchBtn: {
    backgroundColor: COLORS.cyan, borderRadius: 12, paddingHorizontal: 16,
    alignItems: 'center', justifyContent: 'center',
  },
  // Scan button
  scanBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    backgroundColor: '#f59e0b', paddingVertical: 16, borderRadius: 14, marginBottom: 8,
  },
  scanBtnDisabled: { opacity: 0.5 },
  scanBtnText: { color: '#000', fontSize: 14, fontWeight: '900', letterSpacing: 1.5 },
  // All clear
  allClearCard: {
    alignItems: 'center', padding: 40, backgroundColor: 'rgba(16,185,129,0.04)',
    borderRadius: 16, borderWidth: 1, borderColor: 'rgba(16,185,129,0.15)', marginTop: 8,
  },
  allClearTitle: { color: COLORS.emerald, fontSize: 18, fontWeight: '800', marginTop: 16 },
  allClearSub: { color: COLORS.textMuted, fontSize: 13, textAlign: 'center', marginTop: 8, lineHeight: 20, maxWidth: 300 },
  // DTC cards
  dtcCard: {
    borderRadius: 14, borderWidth: 1, marginBottom: 10, overflow: 'hidden',
  },
  dtcHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14,
  },
  dtcCode: { fontSize: 16, fontWeight: '900', fontFamily: 'monospace', letterSpacing: 1 },
  dtcType: { fontSize: 9, color: COLORS.textDim, fontWeight: '700', letterSpacing: 1, marginTop: 1 },
  dtcSystem: { fontSize: 10, color: COLORS.textMuted, fontWeight: '600', maxWidth: 120, textAlign: 'right' },
  dtcDetail: {
    paddingHorizontal: 16, paddingBottom: 16, borderTopWidth: 1, borderTopColor: COLORS.borderLight, paddingTop: 12,
  },
  dtcInterpretation: { color: COLORS.textMain, fontSize: 13, fontWeight: '600', lineHeight: 20, marginBottom: 12 },
  dtcMetaRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  dtcMetaLabel: { color: COLORS.textDim, fontSize: 10, fontWeight: '600', letterSpacing: 0.5, textTransform: 'uppercase' },
  dtcMetaValue: { color: COLORS.textMuted, fontSize: 11, fontWeight: '600', maxWidth: '65%', textAlign: 'right' },
  // Part links
  partLinks: { flexDirection: 'row', gap: 8, marginTop: 12 },
  partBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 10, borderRadius: 10, borderWidth: 1,
  },
  amazonBtn: { backgroundColor: 'rgba(255,153,0,0.08)', borderColor: 'rgba(255,153,0,0.2)' },
  amazonText: { color: '#ff9900', fontSize: 10, fontWeight: '700' },
  ebayBtn: { backgroundColor: 'rgba(0,100,210,0.08)', borderColor: 'rgba(0,100,210,0.2)' },
  ebayText: { color: '#0064d2', fontSize: 10, fontWeight: '700' },
  // Blurred
  blurredBlock: { marginBottom: 12, gap: 6 },
  blurBar: { height: 12, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 4 },
  blurPill: { height: 14, width: 80, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 7 },
  dtcUpgradeBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 12, borderRadius: 10, backgroundColor: 'rgba(6,182,212,0.08)',
    borderWidth: 1, borderColor: 'rgba(6,182,212,0.2)', marginTop: 8,
  },
  dtcUpgradeText: { color: COLORS.cyan, fontSize: 11, fontWeight: '700' },
  // Clear
  clearBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    paddingVertical: 16, borderRadius: 14, borderWidth: 1.5, borderColor: 'rgba(239,68,68,0.3)',
    backgroundColor: 'rgba(239,68,68,0.04)', marginTop: 16,
  },
  clearBtnText: { color: '#ef4444', fontSize: 14, fontWeight: '800', letterSpacing: 1 },
  disclaimer: { fontSize: 10, color: COLORS.textDim, textAlign: 'center', marginTop: 24, lineHeight: 16 },
});
