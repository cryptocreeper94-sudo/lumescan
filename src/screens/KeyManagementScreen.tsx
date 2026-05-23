import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { Key, Plus, Trash2, ShieldCheck, Radio, Lock, ExternalLink } from 'lucide-react-native';
import { COLORS } from '../theme/colors';
import { readIMOKeys, programIMOKey, registerDongleAsKey, deleteIMOKey, type KeyInfo } from '../telemetry/OBDCommands';
import { getWiFiStatus } from '../telemetry/WiFiConnector';

interface Props {
  tier: string;
  mode05Purchased: boolean;
}

export default function KeyManagementScreen({ tier, mode05Purchased }: Props) {
  const [keys, setKeys] = useState<KeyInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [lastReceipt, setLastReceipt] = useState<string | null>(null);
  const connected = getWiFiStatus().status === 'connected';

  useEffect(() => {
    if (connected && mode05Purchased) loadKeys();
  }, [connected, mode05Purchased]);

  const loadKeys = async () => {
    setLoading(true);
    const result = await readIMOKeys();
    if (result.success && result.keys) setKeys(result.keys);
    setLoading(false);
  };

  const handleProgramKey = async () => {
    Alert.alert(
      'Program New Key',
      'Hold the key blank near your phone\'s NFC reader to detect the transponder chip type.\n\nIn demo mode, a simulated key will be programmed.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Program',
          onPress: async () => {
            setActionLoading('program');
            const result = await programIMOKey({ type: 'transponder', chipId: 'DEMO-CHIP' });
            if (result.success && result.keys) setKeys(result.keys);
            if (result.receiptHash) setLastReceipt(result.receiptHash);
            setActionLoading(null);
            Alert.alert(result.success ? '✓ Key Programmed' : '✗ Failed', result.message);
          },
        },
      ]
    );
  };

  const handleRegisterDongle = async () => {
    Alert.alert(
      'Register Dongle as IMMO Key',
      'This registers your LUME dongle as a valid immobilizer key credential on this vehicle. Required for Remote Start (Mode 06).',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Register',
          onPress: async () => {
            setActionLoading('register');
            const result = await registerDongleAsKey();
            if (result.success && result.keys) setKeys(result.keys);
            if (result.receiptHash) setLastReceipt(result.receiptHash);
            setActionLoading(null);
            Alert.alert(result.success ? '✓ Dongle Registered' : '✗ Failed', result.message);
          },
        },
      ]
    );
  };

  const handleDeleteKey = (keyId: string, label: string) => {
    Alert.alert(
      'Delete Key',
      `Are you sure you want to delete "${label}"? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setActionLoading(keyId);
            const result = await deleteIMOKey(keyId);
            if (result.success && result.keys) setKeys(result.keys);
            if (result.receiptHash) setLastReceipt(result.receiptHash);
            setActionLoading(null);
          },
        },
      ]
    );
  };

  // Upgrade prompt if Mode 05 not purchased
  if (!mode05Purchased) {
    return (
      <View style={styles.container}>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <View style={styles.upgradeCard}>
            <Key size={48} color={COLORS.cyan} style={{ marginBottom: 16 }} />
            <Text style={styles.upgradeTitle}>IMMO Key Management</Text>
            <Text style={styles.upgradeSubtitle}>Mode 05</Text>
            <Text style={styles.upgradeDesc}>
              Professional immobilizer key programming on the dongle you already own. Read, program, and delete transponder keys. Every event permanently recorded with a TLL-verified receipt.
            </Text>
            <View style={styles.upgradePricing}>
              <Text style={styles.upgradePrice}>$199</Text>
              <Text style={styles.upgradePriceSub}>one-time unlock</Text>
              <Text style={styles.upgradePerKey}>+ $8.99 per key programmed</Text>
            </View>
            <View style={styles.upgradeFeatures}>
              {[
                'Read registered IMMO keys (Mode 05A)',
                'Program new transponder keys (Mode 05B)',
                'Register dongle for Remote Start (Mode 05C)',
                'Delete lost/stolen keys (Mode 05D)',
                'TLL-verified receipts for every event',
                'Ford, GM, Stellantis supported',
              ].map((f, i) => (
                <View key={i} style={styles.featureRow}>
                  <ShieldCheck size={14} color={COLORS.emerald} />
                  <Text style={styles.featureText}>{f}</Text>
                </View>
              ))}
            </View>
            <TouchableOpacity style={styles.upgradeBtn} activeOpacity={0.8}>
              <Text style={styles.upgradeBtnText}>Unlock Mode 05 — $199</Text>
              <ExternalLink size={16} color="#000" />
            </TouchableOpacity>
            <Text style={styles.upgradeDim}>Requires active diagnostic subscription</Text>
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
            <Key size={22} color={COLORS.cyan} />
            <Text style={styles.headerTitle}>Key Management</Text>
          </View>
          <View style={styles.modeBadge}>
            <Text style={styles.modeText}>MODE 05</Text>
          </View>
        </View>

        {/* Connection Status */}
        <View style={[styles.statusBadge, { borderColor: connected ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)', backgroundColor: connected ? 'rgba(16,185,129,0.06)' : 'rgba(239,68,68,0.06)' }]}>
          <Radio size={12} color={connected ? COLORS.emerald : '#ef4444'} />
          <Text style={[styles.statusText, { color: connected ? COLORS.emerald : '#ef4444' }]}>
            {connected ? (getWiFiStatus().isSimulated ? 'DEMO MODE' : 'ADAPTER CONNECTED') : 'NO CONNECTION'}
          </Text>
        </View>

        {/* Key List */}
        <Text style={styles.sectionTitle}>REGISTERED KEYS — {keys.filter(k => k.status === 'active').length} ACTIVE</Text>
        {loading ? (
          <ActivityIndicator size="small" color={COLORS.cyan} style={{ marginVertical: 24 }} />
        ) : (
          keys.filter(k => k.status === 'active').map((key) => (
            <View key={key.id} style={[styles.keyCard, key.type === 'dongle' && styles.keyCardDongle]}>
              <View style={styles.keyInfo}>
                <View style={styles.keyIcon}>
                  {key.type === 'dongle' ? <Radio size={18} color={COLORS.emerald} /> : <Key size={18} color={COLORS.cyan} />}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.keyLabel}>{key.label}</Text>
                  <Text style={styles.keyMeta}>{key.id} · {key.type} · {new Date(key.registered).toLocaleDateString()}</Text>
                </View>
                {key.type !== 'dongle' && (
                  <TouchableOpacity
                    onPress={() => handleDeleteKey(key.id, key.label)}
                    disabled={actionLoading === key.id}
                    style={styles.deleteBtn}
                  >
                    {actionLoading === key.id
                      ? <ActivityIndicator size="small" color="#ef4444" />
                      : <Trash2 size={16} color="#ef4444" />
                    }
                  </TouchableOpacity>
                )}
              </View>
            </View>
          ))
        )}

        {/* Actions */}
        <Text style={styles.sectionTitle}>ACTIONS</Text>
        
        <TouchableOpacity style={styles.actionBtn} onPress={handleProgramKey} disabled={!!actionLoading} activeOpacity={0.7}>
          {actionLoading === 'program'
            ? <ActivityIndicator size="small" color={COLORS.cyan} />
            : <Plus size={18} color={COLORS.cyan} />
          }
          <View style={{ flex: 1 }}>
            <Text style={styles.actionTitle}>Program New Key</Text>
            <Text style={styles.actionDesc}>NFC read → UDS program → $8.99/key</Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity style={[styles.actionBtn, styles.actionBtnHighlight]} onPress={handleRegisterDongle} disabled={!!actionLoading} activeOpacity={0.7}>
          {actionLoading === 'register'
            ? <ActivityIndicator size="small" color={COLORS.emerald} />
            : <ShieldCheck size={18} color={COLORS.emerald} />
          }
          <View style={{ flex: 1 }}>
            <Text style={[styles.actionTitle, { color: COLORS.emerald }]}>Register Dongle (Mode 05C)</Text>
            <Text style={styles.actionDesc}>Required for Remote Start · One-time setup</Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity style={styles.actionBtn} onPress={loadKeys} disabled={loading} activeOpacity={0.7}>
          <Key size={18} color={COLORS.cyan} />
          <View style={{ flex: 1 }}>
            <Text style={styles.actionTitle}>Refresh Key List</Text>
            <Text style={styles.actionDesc}>Re-read keys from vehicle IMMO module</Text>
          </View>
        </TouchableOpacity>

        {/* Last Receipt */}
        {lastReceipt && (
          <View style={styles.receiptCard}>
            <Text style={styles.receiptLabel}>LAST TLL RECEIPT</Text>
            <Text style={styles.receiptHash} numberOfLines={1} ellipsizeMode="middle">{lastReceipt}</Text>
          </View>
        )}

        <Text style={styles.disclaimer}>
          Ford (PATS), GM (VTD), and Stellantis (SKIM) supported. Toyota, Honda, Nissan in development. 15 US states require locksmith licensing for key programming — the app will notify you of requirements in your state.
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bgDark },
  scrollContent: { padding: 20, paddingTop: 60, paddingBottom: 40 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerTitle: { color: COLORS.textMain, fontSize: 20, fontWeight: '800' },
  modeBadge: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(6,182,212,0.3)', backgroundColor: 'rgba(6,182,212,0.06)' },
  modeText: { color: COLORS.cyan, fontSize: 10, fontWeight: '800', letterSpacing: 1.5 },
  statusBadge: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 8, borderRadius: 10, borderWidth: 1, marginBottom: 20 },
  statusText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
  sectionTitle: { fontSize: 11, color: COLORS.textMuted, fontWeight: '700', letterSpacing: 1.5, marginBottom: 12, marginTop: 8 },
  keyCard: { backgroundColor: COLORS.bgPanel, borderRadius: 12, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: COLORS.borderLight },
  keyCardDongle: { borderColor: 'rgba(16,185,129,0.3)', backgroundColor: 'rgba(16,185,129,0.03)' },
  keyInfo: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  keyIcon: { width: 36, height: 36, borderRadius: 10, backgroundColor: 'rgba(6,182,212,0.08)', alignItems: 'center', justifyContent: 'center' },
  keyLabel: { color: COLORS.textMain, fontSize: 14, fontWeight: '700' },
  keyMeta: { color: COLORS.textDim, fontSize: 10, marginTop: 2, fontFamily: 'monospace' },
  deleteBtn: { padding: 8 },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: COLORS.bgPanel, borderRadius: 12, padding: 16, marginBottom: 8, borderWidth: 1, borderColor: COLORS.borderLight },
  actionBtnHighlight: { borderColor: 'rgba(16,185,129,0.2)', backgroundColor: 'rgba(16,185,129,0.03)' },
  actionTitle: { color: COLORS.textMain, fontSize: 14, fontWeight: '700' },
  actionDesc: { color: COLORS.textDim, fontSize: 11, marginTop: 2 },
  receiptCard: { marginTop: 16, padding: 14, borderRadius: 10, backgroundColor: 'rgba(6,182,212,0.04)', borderWidth: 1, borderColor: 'rgba(6,182,212,0.15)' },
  receiptLabel: { fontSize: 9, color: COLORS.cyan, fontWeight: '700', letterSpacing: 1, marginBottom: 6 },
  receiptHash: { fontSize: 11, color: COLORS.textMuted, fontFamily: 'monospace' },
  disclaimer: { fontSize: 10, color: COLORS.textDim, textAlign: 'center', marginTop: 24, lineHeight: 16, paddingHorizontal: 12 },
  upgradeCard: { alignItems: 'center', padding: 32, marginTop: 40 },
  upgradeTitle: { color: COLORS.textMain, fontSize: 24, fontWeight: '800', marginBottom: 4 },
  upgradeSubtitle: { color: COLORS.cyan, fontSize: 12, fontWeight: '700', letterSpacing: 2, marginBottom: 16 },
  upgradeDesc: { color: COLORS.textMuted, fontSize: 14, lineHeight: 22, textAlign: 'center', marginBottom: 24, maxWidth: 320 },
  upgradePricing: { alignItems: 'center', marginBottom: 24 },
  upgradePrice: { color: COLORS.emerald, fontSize: 48, fontWeight: '800' },
  upgradePriceSub: { color: COLORS.textDim, fontSize: 13, marginTop: 2 },
  upgradePerKey: { color: COLORS.cyan, fontSize: 14, fontWeight: '600', marginTop: 8 },
  upgradeFeatures: { width: '100%', maxWidth: 320, marginBottom: 24 },
  featureRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
  featureText: { color: COLORS.textMuted, fontSize: 13, flex: 1 },
  upgradeBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 16, paddingHorizontal: 32, backgroundColor: COLORS.emerald, borderRadius: 14 },
  upgradeBtnText: { color: '#000', fontSize: 16, fontWeight: '800' },
  upgradeDim: { color: COLORS.textDim, fontSize: 11, marginTop: 12 },
});
