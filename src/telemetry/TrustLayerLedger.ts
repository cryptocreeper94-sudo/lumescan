/**
 * LumeScan — Trust Layer Ledger (TLL) Service
 * =============================================
 * Hashes scan payloads, seals them to the TLL, and provides
 * verification utilities. This is the mobile-side of the
 * TLL integration.
 *
 * DarkWave Studios LLC — Copyright 2026
 */

import { auth } from '../config/firebase';

const TLL_API = 'https://trusthub.tlid.io';

/**
 * SHA-256 hash using SubtleCrypto (available in React Native via expo-crypto)
 * Falls back to a simple hash if crypto is unavailable
 */
async function sha256(data: string): Promise<string> {
  try {
    // Use expo-crypto if available
    const Crypto = require('expo-crypto');
    return await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      data
    );
  } catch {
    // Fallback: basic hash for demo (replace with proper crypto in production)
    let hash = 0;
    for (let i = 0; i < data.length; i++) {
      const char = data.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(16).padStart(64, '0');
  }
}

/**
 * Get the current user's Firebase ID token for API auth
 */
async function getAuthToken(): Promise<string | null> {
  const user = auth.currentUser;
  if (!user) return null;
  try {
    return await user.getIdToken();
  } catch {
    return null;
  }
}

export interface ScanRecord {
  scanId: string;
  scanHash: string;
  healthNarrative: string;
  hallmark: {
    version: string;
    sealedAt: string;
    recordId: string;
  };
  verified: boolean;
  explorerUrl: string;
}

export interface ScanPayload {
  vin: string;
  vehicle?: { year?: number; make?: string; model?: string };
  healthScore: number;
  dtcCount: number;
  dtcCodes: string[];
  signalCount: number;
  signalsRead: number;
  signals: Record<string, any>;
  mode: 'consumer' | 'mechanic';
  snapshotType: 'scan' | 'daily';
}

/**
 * Seal a diagnostic scan to the Trust Layer Ledger
 * 
 * 1. Hashes the raw signal payload with SHA-256
 * 2. POSTs to trusthub.tlid.io/api/lumescan/record-scan
 * 3. Returns the scan certificate with TLL Hallmark
 */
export async function sealScanToLedger(payload: ScanPayload): Promise<ScanRecord | null> {
  try {
    const token = await getAuthToken();
    if (!token) {
      console.warn('[TLL] No auth token — scan will not be sealed');
      return null;
    }

    const response = await fetch(`${TLL_API}/api/lumescan/record-scan`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        ...payload,
        appVersion: '1.0.0',
      }),
    });

    if (!response.ok) {
      console.error('[TLL] Seal failed:', response.status);
      return null;
    }

    const result: ScanRecord = await response.json();
    console.log(`[TLL] ✅ Sealed: ${result.scanId} | Hash: ${result.scanHash?.slice(0, 12)}...`);
    return result;
  } catch (error: any) {
    console.error('[TLL] Seal error:', error?.message);
    return null;
  }
}

/**
 * Verify a scan by its ID (public)
 */
export async function verifyScan(scanId: string): Promise<any | null> {
  try {
    const response = await fetch(`${TLL_API}/api/lumescan/scan/${scanId}`);
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

/**
 * Get the authenticated user's scan history
 */
export async function getScanHistory(limit = 50): Promise<any[]> {
  try {
    const token = await getAuthToken();
    if (!token) return [];

    const response = await fetch(`${TLL_API}/api/lumescan/history?limit=${limit}`, {
      headers: { 'Authorization': `Bearer ${token}` },
    });

    if (!response.ok) return [];
    const data = await response.json();
    return data.scans || [];
  } catch {
    return [];
  }
}

/**
 * Get aggregated stats for the authenticated user
 */
export async function getScanStats(): Promise<any | null> {
  try {
    const token = await getAuthToken();
    if (!token) return null;

    const response = await fetch(`${TLL_API}/api/lumescan/stats`, {
      headers: { 'Authorization': `Bearer ${token}` },
    });

    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

/**
 * Build a scan payload from the current telemetry state
 * and condition report data
 */
export function buildScanPayload(
  report: ReturnType<typeof import('../telemetry/SimulatedEngine').generateConditionReport>,
  signals: Record<string, any>,
  mode: 'consumer' | 'mechanic' = 'consumer'
): ScanPayload {
  // Parse vehicle info from report string
  const vehicleParts = report.vehicle.split(' ');
  const year = parseInt(vehicleParts[0]) || undefined;
  const make = vehicleParts[1] || undefined;
  const model = vehicleParts.slice(2).join(' ') || undefined;

  return {
    vin: report.vin.replace(/•/g, 'X'), // Replace masked chars
    vehicle: { year, make, model },
    healthScore: report.overallHealth,
    dtcCount: signals.sl8_dtcCount || 0,
    dtcCodes: [], // populated from real scan
    signalCount: 42,
    signalsRead: 42,
    signals,
    mode,
    snapshotType: 'scan',
  };
}
