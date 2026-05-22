/**
 * LumeAuto Mobile — Failure Alert Banner
 * Red (active DTC) / Amber (imminent failure) alert banners.
 * Free users: see alert type + code number, content blurred with "Upgrade to Pro" overlay.
 * Pro users: full interpretation, severity, timeline, clickable Amazon/eBay affiliate part links.
 *
 * DarkWave Studios LLC — Copyright 2026
 */

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Linking, Dimensions } from 'react-native';
import { AlertTriangle, XCircle, Lock, ShoppingCart } from 'lucide-react-native';
import { COLORS } from '../theme/colors';
import type { Tier } from '../config/entitlement';

const { width } = Dimensions.get('window');

// Affiliate tags
const AMAZON_TAG = 'garagebot-20';
const EBAY_CAMPAIGN = '5339140935';

export interface FailureAlert {
  type: 'active' | 'imminent';
  code?: string;           // e.g. "P0420"
  system: string;          // e.g. "Catalyst System"
  interpretation: string;  // e.g. "Catalyst System Efficiency Below Threshold"
  severity: string;        // e.g. "Moderate — safe to drive short term"
  timeline?: string;       // e.g. "~6 weeks" (imminent only)
  degradationRate?: string; // e.g. "1.2%/month" (imminent only)
  action: string;          // e.g. "Replace catalytic converter"
  partName: string;        // e.g. "Catalytic Converter"
  partPriceLow: number;    // e.g. 89
  partPriceHigh: number;   // e.g. 350
  vehicle: string;         // e.g. "2019 Ford F-150" — used for affiliate search
}

interface Props {
  alert: FailureAlert;
  tier: Tier;
  onUpgrade?: () => void;
}

function buildAmazonUrl(partName: string, vehicle: string): string {
  const query = encodeURIComponent(`${partName} ${vehicle}`);
  return `https://www.amazon.com/s?k=${query}&i=automotive&tag=${AMAZON_TAG}`;
}

function buildEbayUrl(partName: string, vehicle: string): string {
  const query = encodeURIComponent(`${partName} ${vehicle}`);
  return `https://www.ebay.com/sch/i.html?_nkw=${query}&_sacat=6000&mkcid=1&mkrid=711-53200-19255-0&campid=${EBAY_CAMPAIGN}&toolid=10001`;
}

export default function FailureAlertBanner({ alert, tier, onUpgrade }: Props) {
  const isActive = alert.type === 'active';
  const isPro = tier === 'pro';

  const bannerColor = isActive ? '#ef4444' : '#f59e0b';
  const bannerBg = isActive ? 'rgba(239, 68, 68, 0.06)' : 'rgba(245, 158, 11, 0.06)';
  const bannerBorder = isActive ? 'rgba(239, 68, 68, 0.25)' : 'rgba(245, 158, 11, 0.25)';
  const bannerGlow = isActive ? 'rgba(239, 68, 68, 0.15)' : 'rgba(245, 158, 11, 0.15)';

  const Icon = isActive ? XCircle : AlertTriangle;
  const label = isActive ? 'ACTIVE ISSUE' : 'IMMINENT FAILURE DETECTED';

  return (
    <View style={[styles.banner, { backgroundColor: bannerBg, borderColor: bannerBorder, shadowColor: bannerColor }]}>
      {/* Glow bar at top */}
      <View style={[styles.glowBar, { backgroundColor: bannerColor }]} />

      {/* Header — always visible */}
      <View style={styles.headerRow}>
        <Icon size={18} color={bannerColor} />
        <Text style={[styles.headerLabel, { color: bannerColor }]}>
          {label}{alert.code ? ` — ${alert.code}` : ''}
        </Text>
      </View>

      {/* Content area */}
      <View style={styles.contentArea}>
        {isPro ? (
          /* ─── Pro: Full content ─── */
          <>
            <Text style={styles.interpretation}>{alert.interpretation}</Text>

            {alert.timeline && (
              <View style={styles.metaRow}>
                <Text style={styles.metaLabel}>Timeline</Text>
                <Text style={[styles.metaValue, { color: bannerColor }]}>
                  {alert.degradationRate ? `Degrading at ${alert.degradationRate} — ` : ''}Est. failure: {alert.timeline}
                </Text>
              </View>
            )}

            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>Severity</Text>
              <Text style={styles.metaValue}>{alert.severity}</Text>
            </View>

            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>Action</Text>
              <Text style={styles.metaValue}>{alert.action}</Text>
            </View>

            {/* Affiliate part links */}
            <View style={styles.partLinks}>
              <TouchableOpacity
                style={[styles.partBtn, styles.amazonBtn]}
                onPress={() => Linking.openURL(buildAmazonUrl(alert.partName, alert.vehicle))}
              >
                <ShoppingCart size={14} color="#ff9900" />
                <Text style={styles.amazonText}>
                  Shop Amazon — ${alert.partPriceLow}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.partBtn, styles.ebayBtn]}
                onPress={() => Linking.openURL(buildEbayUrl(alert.partName, alert.vehicle))}
              >
                <ShoppingCart size={14} color="#0064d2" />
                <Text style={styles.ebayText}>
                  Shop eBay — ${alert.partPriceHigh > alert.partPriceLow ? alert.partPriceLow : alert.partPriceHigh}
                </Text>
              </TouchableOpacity>
            </View>
          </>
        ) : (
          /* ─── Free: Blurred content with upgrade CTA ─── */
          <>
            {/* Blurred text placeholders */}
            <View style={styles.blurredBlock}>
              <View style={styles.blurBar1} />
              <View style={styles.blurBar2} />
              <View style={styles.blurBar3} />
              <View style={styles.blurBarShort} />
            </View>

            {/* Blurred severity */}
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>Severity</Text>
              <View style={styles.blurPill} />
            </View>

            {/* Blurred part links */}
            <View style={styles.partLinks}>
              <View style={[styles.partBtn, styles.blurredPartBtn]}>
                <View style={styles.blurPillSmall} />
              </View>
              <View style={[styles.partBtn, styles.blurredPartBtn]}>
                <View style={styles.blurPillSmall} />
              </View>
            </View>

            {/* Upgrade CTA overlay */}
            <TouchableOpacity
              style={styles.upgradeOverlay}
              onPress={onUpgrade || (() => Linking.openURL('https://lumeauto.tech/order'))}
              activeOpacity={0.8}
            >
              <Lock size={16} color={COLORS.cyan} />
              <Text style={styles.upgradeText}>
                {isActive ? 'Upgrade to Pro for full diagnosis + parts' : 'Upgrade to Pro to read this alert'}
              </Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 16,
    overflow: 'hidden',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 6,
  },
  glowBar: {
    height: 3,
    width: '100%',
    opacity: 0.8,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 10,
  },
  headerLabel: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  contentArea: {
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  interpretation: {
    color: COLORS.textMain,
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 20,
    marginBottom: 12,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  metaLabel: {
    color: COLORS.textDim,
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  metaValue: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontWeight: '600',
    maxWidth: '70%',
    textAlign: 'right',
  },
  partLinks: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
  },
  partBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  amazonBtn: {
    backgroundColor: 'rgba(255, 153, 0, 0.08)',
    borderColor: 'rgba(255, 153, 0, 0.2)',
  },
  amazonText: {
    color: '#ff9900',
    fontSize: 11,
    fontWeight: '700',
  },
  ebayBtn: {
    backgroundColor: 'rgba(0, 100, 210, 0.08)',
    borderColor: 'rgba(0, 100, 210, 0.2)',
  },
  ebayText: {
    color: '#0064d2',
    fontSize: 11,
    fontWeight: '700',
  },
  // ─── Blurred content for free tier ───
  blurredBlock: {
    marginBottom: 12,
    gap: 6,
  },
  blurBar1: {
    height: 12,
    width: '90%',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 4,
  },
  blurBar2: {
    height: 12,
    width: '75%',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 4,
  },
  blurBar3: {
    height: 12,
    width: '60%',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 4,
  },
  blurBarShort: {
    height: 12,
    width: '40%',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 4,
  },
  blurPill: {
    height: 14,
    width: 80,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 7,
  },
  blurPillSmall: {
    height: 12,
    width: 60,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 6,
  },
  blurredPartBtn: {
    backgroundColor: 'rgba(255,255,255,0.02)',
    borderColor: 'rgba(255,255,255,0.06)',
  },
  upgradeOverlay: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 12,
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 12,
    backgroundColor: 'rgba(6, 182, 212, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(6, 182, 212, 0.2)',
  },
  upgradeText: {
    color: COLORS.cyan,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
});
