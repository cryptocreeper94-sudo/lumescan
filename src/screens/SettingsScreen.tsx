import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Switch, Alert, Linking } from 'react-native';
import { Settings, User, Shield, Wrench, Radio, LogOut, ExternalLink, ChevronRight, Key, Zap } from 'lucide-react-native';
import Constants from 'expo-constants';
import { COLORS } from '../theme/colors';
import { auth } from '../config/firebase';
import { getWiFiStatus, disconnectWiFi } from '../telemetry/WiFiConnector';

interface Props {
  mechanicMode: boolean;
  onToggleMechanic: (value: boolean) => void;
  tier: string;
  mode05Purchased: boolean;
  mode06Purchased: boolean;
}

export default function SettingsScreen({ mechanicMode, onToggleMechanic, tier, mode05Purchased, mode06Purchased }: Props) {
  const user = auth.currentUser;
  const wifiStatus = getWiFiStatus();

  const handleSignOut = () => {
    Alert.alert('Sign Out', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: () => auth.signOut() },
    ]);
  };

  const handleDisconnect = () => {
    disconnectWiFi();
    Alert.alert('Disconnected', 'Adapter disconnected.');
  };

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Header */}
        <View style={styles.header}>
          <Settings size={22} color={COLORS.cyan} />
          <Text style={styles.headerTitle}>Settings</Text>
        </View>

        {/* Account */}
        <Text style={styles.sectionTitle}>ACCOUNT</Text>
        <View style={styles.card}>
          <View style={styles.row}>
            <User size={16} color={COLORS.cyan} />
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>{user?.displayName || 'User'}</Text>
              <Text style={styles.rowSub}>{user?.email}</Text>
            </View>
          </View>
          <View style={styles.divider} />
          <View style={styles.row}>
            <Shield size={16} color={COLORS.emerald} />
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>License</Text>
              <Text style={styles.rowSub}>
                {tier === 'pro' ? 'Pro — Full 42-Signal Engine' : 'Free — 3 Signals'}
              </Text>
            </View>
            {tier !== 'pro' && (
              <TouchableOpacity onPress={() => Linking.openURL('https://lumeauto.tech/order')}>
                <Text style={styles.upgradeLink}>Upgrade →</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Mode Toggle */}
        <Text style={styles.sectionTitle}>INTERFACE MODE</Text>
        <View style={styles.card}>
          <View style={styles.row}>
            <Wrench size={16} color={mechanicMode ? COLORS.emerald : COLORS.textDim} />
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>Mechanic Mode</Text>
              <Text style={styles.rowSub}>
                {mechanicMode
                  ? 'Shows Key Management, Remote Start, and advanced tools'
                  : 'Consumer view — clean diagnostics only'
                }
              </Text>
            </View>
            <Switch
              value={mechanicMode}
              onValueChange={onToggleMechanic}
              trackColor={{ false: 'rgba(255,255,255,0.08)', true: 'rgba(16,185,129,0.3)' }}
              thumbColor={mechanicMode ? COLORS.emerald : '#666'}
            />
          </View>
        </View>

        {/* Mode 05/06 Status */}
        {mechanicMode && (
          <>
            <Text style={styles.sectionTitle}>PRO TOOLS</Text>
            <View style={styles.card}>
              <View style={styles.row}>
                <Key size={16} color={mode05Purchased ? COLORS.emerald : COLORS.textDim} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle}>Mode 05 — Key Management</Text>
                  <Text style={styles.rowSub}>
                    {mode05Purchased ? 'Active — $8.99/key' : '$199 unlock'}
                  </Text>
                </View>
                {!mode05Purchased && (
                  <TouchableOpacity onPress={() => Linking.openURL('https://lumeauto.tech/order')}>
                    <ChevronRight size={16} color={COLORS.textDim} />
                  </TouchableOpacity>
                )}
              </View>
              <View style={styles.divider} />
              <View style={styles.row}>
                <Zap size={16} color={mode06Purchased ? COLORS.emerald : COLORS.textDim} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle}>Mode 06 — Remote Start</Text>
                  <Text style={styles.rowSub}>
                    {mode06Purchased ? 'Active — $9.99/mo' : '$9.99/mo subscription'}
                  </Text>
                </View>
                {!mode06Purchased && (
                  <TouchableOpacity onPress={() => Linking.openURL('https://lumeauto.tech/order')}>
                    <ChevronRight size={16} color={COLORS.textDim} />
                  </TouchableOpacity>
                )}
              </View>
            </View>
          </>
        )}

        {/* Connection */}
        <Text style={styles.sectionTitle}>CONNECTION</Text>
        <View style={styles.card}>
          <View style={styles.row}>
            <Radio size={16} color={wifiStatus.status === 'connected' ? COLORS.emerald : COLORS.textDim} />
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>
                {wifiStatus.status === 'connected' ? 'Connected' : 'Not Connected'}
              </Text>
              <Text style={styles.rowSub}>
                {wifiStatus.isSimulated ? 'Demo Mode' : wifiStatus.adapterInfo || wifiStatus.host || 'No adapter'}
              </Text>
            </View>
            {wifiStatus.status === 'connected' && (
              <TouchableOpacity onPress={handleDisconnect}>
                <Text style={[styles.upgradeLink, { color: '#ef4444' }]}>Disconnect</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Links */}
        <Text style={styles.sectionTitle}>RESOURCES</Text>
        <View style={styles.card}>
          {[
            { label: 'Order & Pricing', url: 'https://lumeauto.tech/order' },
            { label: 'Terms of Service', url: 'https://lumeauto.tech/terms' },
            { label: 'Privacy Policy', url: 'https://lumeauto.tech/privacy' },
            { label: 'DarkWave Studios', url: 'https://dwtl.io' },
          ].map((link, i) => (
            <React.Fragment key={i}>
              {i > 0 && <View style={styles.divider} />}
              <TouchableOpacity style={styles.row} onPress={() => Linking.openURL(link.url)}>
                <ExternalLink size={14} color={COLORS.textDim} />
                <Text style={[styles.rowTitle, { flex: 1 }]}>{link.label}</Text>
                <ChevronRight size={14} color={COLORS.textDim} />
              </TouchableOpacity>
            </React.Fragment>
          ))}
        </View>

        {/* Sign Out */}
        <TouchableOpacity style={styles.signOutBtn} onPress={handleSignOut}>
          <LogOut size={16} color="#ef4444" />
          <Text style={styles.signOutText}>Sign Out</Text>
        </TouchableOpacity>

        <Text style={styles.version}>LumeScan v{Constants.expoConfig?.version || '1.0.0'} · Build {Constants.expoConfig?.android?.versionCode || '—'} · DarkWave Studios LLC · US Patent Pending 64/032,339</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bgDark },
  scrollContent: { padding: 20, paddingTop: 60, paddingBottom: 40, maxWidth: 700, alignSelf: 'center' as const, width: '100%' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 24 },
  headerTitle: { color: COLORS.textMain, fontSize: 20, fontWeight: '800' },
  sectionTitle: { fontSize: 11, color: COLORS.textMuted, fontWeight: '700', letterSpacing: 1.5, marginBottom: 8, marginTop: 16 },
  card: { backgroundColor: COLORS.bgPanel, borderRadius: 14, borderWidth: 1, borderColor: COLORS.borderLight, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  rowTitle: { color: COLORS.textMain, fontSize: 14, fontWeight: '600' },
  rowSub: { color: COLORS.textDim, fontSize: 11, marginTop: 1 },
  divider: { height: 1, backgroundColor: COLORS.borderLight },
  upgradeLink: { color: COLORS.cyan, fontSize: 12, fontWeight: '700' },
  signOutBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, marginTop: 24, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(239,68,68,0.2)', backgroundColor: 'rgba(239,68,68,0.04)' },
  signOutText: { color: '#ef4444', fontSize: 14, fontWeight: '600' },
  version: { color: COLORS.textDim, fontSize: 9, textAlign: 'center', marginTop: 24, letterSpacing: 0.5, lineHeight: 14 },
});
