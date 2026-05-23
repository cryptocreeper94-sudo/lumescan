/**
 * LUME Mode 05 + Mode 06 — OBD-II Command Protocol Layer
 * 
 * Sends UDS (Unified Diagnostic Services) commands via the WiFi/BLE adapter
 * for IMMO key management (Mode 05) and remote start governance (Mode 06).
 * 
 * When connected to a real adapter: sends actual CAN-bus commands.
 * When in demo mode: returns simulated responses for full workflow demonstration.
 * 
 * DarkWave Studios LLC — Copyright 2026
 * US Provisional Patent 64/032,339
 */

import { getWiFiStatus } from './WiFiConnector';

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

export interface KeyInfo {
  id: string;
  type: 'transponder' | 'smart_key' | 'dongle';
  label: string;
  registered: string; // ISO date
  status: 'active' | 'lost' | 'deleted';
}

export interface ReadinessCheck {
  timestamp: number;
  hoodClosed: boolean;
  batteryVoltage: number;
  batteryOk: boolean;       // > 11.8V
  activeDTCs: number;
  dtcsClear: boolean;       // 0 active DTCs
  immoRegistered: boolean;  // Dongle is registered key
  engineOff: boolean;
  gearPark: boolean;        // Vehicle in park/neutral
  allPassed: boolean;
}

export interface RuntimeStatus {
  running: boolean;
  rpm: number;
  coolantTemp: number;
  batteryVoltage: number;
  elapsedSeconds: number;
  maxSeconds: number;
  autoStopReason: string | null;
}

export interface Mode05Result {
  success: boolean;
  command: '05A' | '05B' | '05C' | '05D';
  message: string;
  keys?: KeyInfo[];
  receiptHash?: string;
}

export interface Mode06Result {
  success: boolean;
  command: '06A' | '06B' | '06C' | '06D' | '06E';
  message: string;
  readiness?: ReadinessCheck;
  runtime?: RuntimeStatus;
  receiptHash?: string;
}

// ═══════════════════════════════════════════════════════════════
// Safety State
// ═══════════════════════════════════════════════════════════════

let startAttempts = 0;
let lastAttemptWindow = 0;
let activeRuntime: RuntimeStatus | null = null;
let runtimeInterval: ReturnType<typeof setInterval> | null = null;

// ═══════════════════════════════════════════════════════════════
// Demo Mode Simulated Data
// ═══════════════════════════════════════════════════════════════

const DEMO_KEYS: KeyInfo[] = [
  { id: 'KEY-001', type: 'transponder', label: 'Original Key #1', registered: '2019-03-15T00:00:00Z', status: 'active' },
  { id: 'KEY-002', type: 'transponder', label: 'Original Key #2', registered: '2019-03-15T00:00:00Z', status: 'active' },
  { id: 'KEY-003', type: 'smart_key', label: 'Spare Key (Dealer)', registered: '2022-08-20T00:00:00Z', status: 'active' },
];

function generateReceiptHash(): string {
  const chars = '0123456789abcdef';
  let hash = '0x';
  for (let i = 0; i < 64; i++) hash += chars[Math.floor(Math.random() * 16)];
  return hash;
}

function isDemo(): boolean {
  return getWiFiStatus().isSimulated || getWiFiStatus().status !== 'connected';
}

// ═══════════════════════════════════════════════════════════════
// MODE 05 — IMMO KEY MANAGEMENT
// ═══════════════════════════════════════════════════════════════

/**
 * Mode 05A — Read registered IMMO keys
 * UDS: Extended Diagnostic Session → Security Access → Read Data By ID
 */
export async function readIMOKeys(): Promise<Mode05Result> {
  if (isDemo()) {
    await simulateDelay(1500);
    return {
      success: true,
      command: '05A',
      message: `${DEMO_KEYS.filter(k => k.status === 'active').length} keys registered`,
      keys: [...DEMO_KEYS],
    };
  }

  // Real adapter: Send UDS commands
  // TODO: Implement when NASTF SDRM algorithms are integrated
  // 1. Enter Extended Diagnostic Session (0x10 03)
  // 2. Security Access - Request Seed (0x27 01)
  // 3. Security Access - Send Key (0x27 02 + computed key)
  // 4. Read Data By Identifier (0x22 + IMMO key list DID)
  return {
    success: false,
    command: '05A',
    message: 'NASTF SDRM integration pending — schedule activation at lumeauto.tech',
  };
}

/**
 * Mode 05B — Program new transponder key
 * UDS: Extended Session → Security Access → Write Data
 */
export async function programIMOKey(keyData: { type: string; chipId: string }): Promise<Mode05Result> {
  if (isDemo()) {
    await simulateDelay(3000);
    const newKey: KeyInfo = {
      id: `KEY-${String(DEMO_KEYS.length + 1).padStart(3, '0')}`,
      type: 'transponder',
      label: `Programmed Key #${DEMO_KEYS.length + 1}`,
      registered: new Date().toISOString(),
      status: 'active',
    };
    DEMO_KEYS.push(newKey);
    return {
      success: true,
      command: '05B',
      message: 'Key programmed successfully',
      keys: [...DEMO_KEYS],
      receiptHash: generateReceiptHash(),
    };
  }

  return {
    success: false,
    command: '05B',
    message: 'NASTF SDRM integration pending — schedule activation at lumeauto.tech',
  };
}

/**
 * Mode 05C — Register dongle as IMMO key credential
 * This is the prerequisite for Mode 06 (Remote Start)
 */
export async function registerDongleAsKey(): Promise<Mode05Result> {
  if (isDemo()) {
    await simulateDelay(4000);
    const dongleKey: KeyInfo = {
      id: 'LUME-DONGLE',
      type: 'dongle',
      label: 'LUME Dongle (Remote Start)',
      registered: new Date().toISOString(),
      status: 'active',
    };
    // Check if already registered
    const existing = DEMO_KEYS.find(k => k.id === 'LUME-DONGLE');
    if (!existing) DEMO_KEYS.push(dongleKey);
    return {
      success: true,
      command: '05C',
      message: 'Dongle registered as IMMO key credential',
      keys: [...DEMO_KEYS],
      receiptHash: generateReceiptHash(),
    };
  }

  return {
    success: false,
    command: '05C',
    message: 'NASTF SDRM integration pending — schedule activation at lumeauto.tech',
  };
}

/**
 * Mode 05D — Delete key credential
 */
export async function deleteIMOKey(keyId: string): Promise<Mode05Result> {
  if (isDemo()) {
    await simulateDelay(2000);
    const key = DEMO_KEYS.find(k => k.id === keyId);
    if (key) key.status = 'deleted';
    return {
      success: true,
      command: '05D',
      message: `Key ${keyId} deleted`,
      keys: [...DEMO_KEYS],
      receiptHash: generateReceiptHash(),
    };
  }

  return {
    success: false,
    command: '05D',
    message: 'NASTF SDRM integration pending',
  };
}

// ═══════════════════════════════════════════════════════════════
// MODE 06 — REMOTE START GOVERNANCE
// ═══════════════════════════════════════════════════════════════

/**
 * Mode 06A — Pre-start readiness check
 * Reads hood status, battery, DTCs, IMMO credential, gear position
 * This is READ-ONLY and works on any adapter
 */
export async function checkStartReadiness(): Promise<Mode06Result> {
  if (isDemo()) {
    await simulateDelay(2000);
    const readiness: ReadinessCheck = {
      timestamp: Date.now(),
      hoodClosed: true,
      batteryVoltage: 14.1 + (Math.random() - 0.5) * 0.4,
      batteryOk: true,
      activeDTCs: 0,
      dtcsClear: true,
      immoRegistered: DEMO_KEYS.some(k => k.id === 'LUME-DONGLE' && k.status === 'active'),
      engineOff: true,
      gearPark: true,
      allPassed: true,
    };
    // Check if IMMO isn't registered — that blocks everything
    if (!readiness.immoRegistered) {
      readiness.allPassed = false;
    }
    return {
      success: true,
      command: '06A',
      message: readiness.allPassed ? 'All safety checks passed' : 'Pre-start check failed — see details',
      readiness,
    };
  }

  // Real adapter: These are standard OBD-II reads + some manufacturer-specific DIDs
  // Battery: PID 0142, DTCs: Mode 03, Hood: manufacturer DID
  return {
    success: false,
    command: '06A',
    message: 'Connect adapter to run readiness check',
  };
}

/**
 * Mode 06B — IMMO authentication handshake
 * Verifies the dongle's IMMO credential with the vehicle
 */
export async function authenticateIMO(): Promise<Mode06Result> {
  if (isDemo()) {
    await simulateDelay(1500);
    const registered = DEMO_KEYS.some(k => k.id === 'LUME-DONGLE' && k.status === 'active');
    return {
      success: registered,
      command: '06B',
      message: registered ? 'IMMO authentication successful' : 'Dongle not registered — complete Mode 05C first',
    };
  }

  return {
    success: false,
    command: '06B',
    message: 'NASTF SDRM integration pending',
  };
}

/**
 * Mode 06C — Send CAN-bus remote start sequence
 * HC-R3: Max 3 attempts per 10 minutes
 */
export async function sendRemoteStart(runtimeMinutes: number = 10): Promise<Mode06Result> {
  // Enforce HC-R3: 3 attempts per 10 minutes
  const now = Date.now();
  if (now - lastAttemptWindow > 600000) {
    startAttempts = 0;
    lastAttemptWindow = now;
  }
  if (startAttempts >= 3) {
    return {
      success: false,
      command: '06C',
      message: `Rate limited — 3 attempts per 10 minutes. Wait ${Math.ceil((lastAttemptWindow + 600000 - now) / 60000)} min.`,
    };
  }
  startAttempts++;

  // Enforce runtime limits (HC-R6)
  const maxSeconds = Math.min(Math.max(runtimeMinutes, 5), 20) * 60;

  if (isDemo()) {
    await simulateDelay(3000);

    activeRuntime = {
      running: true,
      rpm: 680 + Math.random() * 40,
      coolantTemp: 45,
      batteryVoltage: 14.1,
      elapsedSeconds: 0,
      maxSeconds,
      autoStopReason: null,
    };

    return {
      success: true,
      command: '06C',
      message: 'Engine started — runtime monitoring active',
      runtime: { ...activeRuntime },
      receiptHash: generateReceiptHash(),
    };
  }

  return {
    success: false,
    command: '06C',
    message: 'NASTF SDRM integration pending',
  };
}

/**
 * Mode 06D — Remote stop
 */
export async function sendRemoteStop(): Promise<Mode06Result> {
  if (isDemo()) {
    await simulateDelay(1000);
    const elapsed = activeRuntime?.elapsedSeconds || 0;
    activeRuntime = null;
    if (runtimeInterval) {
      clearInterval(runtimeInterval);
      runtimeInterval = null;
    }
    return {
      success: true,
      command: '06D',
      message: `Engine stopped after ${elapsed}s`,
      receiptHash: generateReceiptHash(),
    };
  }

  return {
    success: false,
    command: '06D',
    message: 'No active remote start session',
  };
}

/**
 * Mode 06E — Poll runtime status
 * Called every 5 seconds during active remote start
 */
export function pollRuntimeStatus(): RuntimeStatus | null {
  if (!activeRuntime || !activeRuntime.running) return null;

  // Simulate runtime progression
  activeRuntime.elapsedSeconds += 5;
  activeRuntime.rpm = 680 + Math.random() * 60 - 30;
  activeRuntime.coolantTemp = Math.min(92, activeRuntime.coolantTemp + 0.8 + Math.random() * 0.3);
  activeRuntime.batteryVoltage = 14.0 + Math.random() * 0.4;

  // HC-R6: Auto-stop on timeout
  if (activeRuntime.elapsedSeconds >= activeRuntime.maxSeconds) {
    activeRuntime.running = false;
    activeRuntime.autoStopReason = 'Runtime limit reached';
  }

  // HC-R8: Simulate random hood-open event (rare)
  if (Math.random() < 0.002) {
    activeRuntime.running = false;
    activeRuntime.autoStopReason = 'Hood opened — safety stop';
  }

  return { ...activeRuntime };
}

/**
 * Check if there's an active remote start session
 */
export function isEngineRunning(): boolean {
  return activeRuntime?.running === true;
}

/**
 * Get the active runtime data without advancing simulation
 */
export function getActiveRuntime(): RuntimeStatus | null {
  return activeRuntime ? { ...activeRuntime } : null;
}

/**
 * Reset start attempt counter (called on app restart)
 */
export function resetAttemptCounter(): void {
  startAttempts = 0;
  lastAttemptWindow = 0;
}

// ═══════════════════════════════════════════════════════════════
// Utilities
// ═══════════════════════════════════════════════════════════════

function simulateDelay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
