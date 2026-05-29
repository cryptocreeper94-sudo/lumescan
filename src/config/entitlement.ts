/**
 * LumeAuto Mobile — Entitlement Gating
 * Free tier: code reading, 3 signals (RPM, speed, coolant), reports view-only
 * Pro tier: full 42-signal engine, fuel coaching, predictive maintenance, driver scoring
 * Bypass: DarkWave/Cox internal accounts
 *
 * DarkWave Studios LLC — Copyright 2026
 */

import { auth } from './firebase';

// ── Bypass Domains & Emails ──
// These accounts skip the paygate entirely (Cox internal testing, DarkWave team)
const BYPASS_DOMAINS = ['coxautoinc.com', 'darkwavestudios.com', 'manheim.com'];
const BYPASS_EMAILS = [
  'kathytidwell74@gmail.com',
  'rtaron@bellsouth.net',
  'cryptocreeper94@gmail.com',
  'averymackenna@gmail.com',
  'barrycline33@gmail.com',
  'pcdirect97@gmail.com',
];

const FIRESTORE_PROJECT = 'darkwave-auth';

export type Tier = 'pro' | 'free' | 'none';

export interface EntitlementStatus {
  entitled: boolean;
  tier: Tier;
  reason: 'purchased' | 'bypass_domain' | 'bypass_email' | 'free_tier' | 'not_purchased' | 'not_authenticated' | 'error';
  email?: string;
  mode05Purchased?: boolean;
  mode06Active?: boolean;
}

// ── Free tier limits ──
// Just enough to prove the app works. Not enough to replace a $20 scanner.
// Show all 42 gauge slots but blur/lock 39 of them for FOMO.
export const FREE_TIER_LIMITS = {
  maxSignals: 3,          // RPM, speed, coolant temp only
  visibleSignals: 42,     // Show all gauges but lock 39 (blurred)
  maxReportsPerDay: 0,    // View only — no save/export
  fuelCoaching: false,    // GATED — this is the $328/yr value prop
  predictiveMaintenance: false, // GATED — killer differentiator
  driverScoring: false,   // GATED
  codeReading: true,      // Gets them in the door
  codeClear: true,        // Makes them love the app
  exportEnabled: false,   // No CSV/PDF export on free
};

export const PRO_TIER_LIMITS = {
  maxSignals: 42,
  visibleSignals: 42,
  maxReportsPerDay: Infinity,
  fuelCoaching: true,
  predictiveMaintenance: true,
  driverScoring: true,
  codeReading: true,
  codeClear: true,
  exportEnabled: true,
};

/**
 * Check if the current user is entitled to use Lume Scan.
 * All authenticated users get free tier. Pro requires purchase or bypass.
 */
export async function checkEntitlement(): Promise<EntitlementStatus> {
  const user = auth.currentUser;

  if (!user || !user.email) {
    return { entitled: false, tier: 'none', reason: 'not_authenticated' };
  }

  const email = user.email.toLowerCase();
  const domain = email.split('@')[1];

  // ── Cox / DarkWave bypass → Pro ──
  if (BYPASS_DOMAINS.includes(domain)) {
    return { entitled: true, tier: 'pro', reason: 'bypass_domain', email, mode05Purchased: true, mode06Active: true };
  }
  if (BYPASS_EMAILS.includes(email)) {
    return { entitled: true, tier: 'pro', reason: 'bypass_email', email, mode05Purchased: true, mode06Active: true };
  }

  // ── Firestore entitlement check ──
  try {
    const firestoreUrl = `https://firestore.googleapis.com/v1/projects/${FIRESTORE_PROJECT}/databases/(default)/documents/entitlements/${encodeURIComponent(email)}`;
    const res = await fetch(firestoreUrl);

    if (res.ok) {
      const doc = await res.json();
      const purchased = doc?.fields?.lumescan_purchased?.booleanValue === true;
      const mode05 = doc?.fields?.lumescan_mode05_purchased?.booleanValue === true;
      const mode06 = doc?.fields?.lumescan_mode06_active?.booleanValue === true;
      if (purchased) {
        return { entitled: true, tier: 'pro', reason: 'purchased', email, mode05Purchased: mode05, mode06Active: mode06 };
      }
      // Has a document but hasn't purchased → free tier
      return { entitled: true, tier: 'free', reason: 'free_tier', email, mode05Purchased: false, mode06Active: false };
    }

    // Document doesn't exist = free tier (everyone gets in now)
    if (res.status === 404) {
      return { entitled: true, tier: 'free', reason: 'free_tier', email, mode05Purchased: false, mode06Active: false };
    }

    // Unexpected error — allow free tier so app is usable
    console.warn('[Entitlement] Firestore check returned:', res.status);
    return { entitled: true, tier: 'free', reason: 'free_tier', email };
  } catch (err) {
    console.error('[Entitlement] Check failed:', err);
    // Offline or error — allow free tier
    return { entitled: true, tier: 'free', reason: 'free_tier', email };
  }
}

/**
 * Get the feature limits for a given tier.
 */
export function getTierLimits(tier: Tier) {
  return tier === 'pro' ? PRO_TIER_LIMITS : FREE_TIER_LIMITS;
}

/**
 * Quick check: is this email a bypass account?
 * Useful for UI decisions without async Firestore call.
 */
export function isBypassAccount(email: string): boolean {
  const lower = email.toLowerCase();
  const domain = lower.split('@')[1];
  return BYPASS_DOMAINS.includes(domain) || BYPASS_EMAILS.includes(lower);
}
