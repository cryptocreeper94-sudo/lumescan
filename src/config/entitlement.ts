/**
 * LumeAuto Mobile — Entitlement Gating
 * Checks Firebase Firestore for lumescan_purchased flag.
 * Bypasses gate for Cox internal / DarkWave / whitelisted accounts.
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
];

const FIRESTORE_PROJECT = 'darkwave-auth';

export interface EntitlementStatus {
  entitled: boolean;
  reason: 'purchased' | 'bypass_domain' | 'bypass_email' | 'not_purchased' | 'not_authenticated' | 'error';
  email?: string;
}

/**
 * Check if the current user is entitled to use Lume Scan.
 * Returns immediately for bypass accounts, queries Firestore for everyone else.
 */
export async function checkEntitlement(): Promise<EntitlementStatus> {
  const user = auth.currentUser;

  if (!user || !user.email) {
    return { entitled: false, reason: 'not_authenticated' };
  }

  const email = user.email.toLowerCase();
  const domain = email.split('@')[1];

  // ── Cox / DarkWave bypass ──
  if (BYPASS_DOMAINS.includes(domain)) {
    return { entitled: true, reason: 'bypass_domain', email };
  }
  if (BYPASS_EMAILS.includes(email)) {
    return { entitled: true, reason: 'bypass_email', email };
  }

  // ── Firestore entitlement check ──
  try {
    const firestoreUrl = `https://firestore.googleapis.com/v1/projects/${FIRESTORE_PROJECT}/databases/(default)/documents/entitlements/${encodeURIComponent(email)}`;
    const res = await fetch(firestoreUrl);

    if (res.ok) {
      const doc = await res.json();
      const purchased = doc?.fields?.lumescan_purchased?.booleanValue === true;
      return {
        entitled: purchased,
        reason: purchased ? 'purchased' : 'not_purchased',
        email,
      };
    }

    // Document doesn't exist = not purchased
    if (res.status === 404) {
      return { entitled: false, reason: 'not_purchased', email };
    }

    // Unexpected error — fail open for now (you can change to fail closed)
    console.warn('[Entitlement] Firestore check returned:', res.status);
    return { entitled: false, reason: 'error', email };
  } catch (err) {
    console.error('[Entitlement] Check failed:', err);
    return { entitled: false, reason: 'error', email };
  }
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
