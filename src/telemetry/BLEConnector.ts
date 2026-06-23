/**
 * Lume Scan — Universal BLE OBD-II Connector
 * =============================================
 * Connects to ANY BLE 4.0+ ELM327-compatible OBD-II adapter.
 * 
 * Supported adapters (non-exhaustive):
 *   Vgate iCar Pro, BAFX Products, OBDLink MX+, Veepeak BLE,
 *   Carista, KONNWEI, Autophix, Foseal, Panlong, Tonwon
 * 
 * Architecture:
 *   1. Scan by device NAME (not service UUID) — most reliable discovery
 *   2. After connect, enumerate ALL services → find writable + notifiable chars
 *   3. Prefer single characteristic for both TX/RX (common on cheap adapters)
 *   4. Fall back to separate TX (write) and RX (notify) characteristics
 *   5. All ELM327 AT commands + OBD-II PID reads use the same protocol
 * 
 * DarkWave Studios LLC — Copyright 2026
 * US Provisional Patent 64/032,339
 */

import { BleManager, Device, Characteristic, Subscription } from 'react-native-ble-plx';
import { TelemetrySnapshot, tick as simulatedTick } from './SimulatedEngine';
import { Platform, PermissionsAndroid } from 'react-native';

// ═══════════════════════════════════════════════════════════════
// Adapter Discovery — Name-Based (Universal)
// ═══════════════════════════════════════════════════════════════

/** 
 * Known OBD-II adapter name patterns. Case-insensitive substring match.
 * This is the most reliable way to discover adapters — service UUID filtering
 * misses adapters that use non-standard UUIDs.
 */
const ADAPTER_NAME_PATTERNS = [
  // Major brands
  'vgate', 'icar', 'elm327', 'elm 327',
  'obd', 'obdii', 'obd2', 'obdlink',
  'bafx', 'veepeak', 'carista',
  'konnwei', 'autophix', 'foseal',
  'panlong', 'tonwon', 'vlink', 'vlinker',
  'bluedriver', 'fixd', 'torque',
  'scantools', 'scantool',
  // Generic patterns
  'bt-obd', 'wifi_obd', 'ble_obd',
  'car scanner', 'car diagnostic',
];

/**
 * Known BLE service UUIDs used by OBD-II adapters.
 * Used as a SECONDARY filter after name matching.
 */
const KNOWN_SERVICE_UUIDS = [
  '0000ffe0-0000-1000-8000-00805f9b34fb', // Most common (Vgate, generics)
  '0000fff0-0000-1000-8000-00805f9b34fb', // Some adapters
  'e7810a71-73ae-499d-8c15-faa9aef0c3f2', // BAFX
  '00001101-0000-1000-8000-00805f9b34fb', // SPP-like
];

/**
 * Known characteristic UUIDs for TX/RX.
 */
const KNOWN_CHAR_UUIDS = [
  '0000ffe1-0000-1000-8000-00805f9b34fb', // Most common (Vgate, generics)
  '0000fff1-0000-1000-8000-00805f9b34fb',
  '0000fff2-0000-1000-8000-00805f9b34fb',
  'bef8d6c9-9c21-4c9e-b632-bd58c1009f9f', // BAFX TX
];

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

export type BLEStatus = 'disconnected' | 'scanning' | 'connecting' | 'initializing' | 'connected' | 'error';

export interface BLEConnection {
  status: BLEStatus;
  deviceName: string | null;
  error: string | null;
  isSimulated: boolean;
  adapterInfo: string | null;
}

// ═══════════════════════════════════════════════════════════════
// State
// ═══════════════════════════════════════════════════════════════

const manager = new BleManager();
let connectedDevice: Device | null = null;
let txCharacteristic: Characteristic | null = null;  // Write commands TO adapter
let rxCharacteristic: Characteristic | null = null;  // Read responses FROM adapter
let notificationSub: Subscription | null = null;
let responseBuffer = '';
let responseResolve: ((value: string) => void) | null = null;
let connectionState: BLEConnection = {
  status: 'disconnected', deviceName: null, error: null, isSimulated: false, adapterInfo: null,
};

let rawValues: Record<string, number> = {};
let startTime = Date.now();

// ═══════════════════════════════════════════════════════════════
// OBD-II PID Definitions (SAE J1979 — universal)
// ═══════════════════════════════════════════════════════════════

const PIDS: { cmd: string; parse: (hex: string) => Record<string, number>; optional?: boolean }[] = [
  // ── Throughput Base (TB) ──
  { cmd: '010C', parse: (h) => ({ rpm: (parseInt(h.slice(0, 2), 16) * 256 + parseInt(h.slice(2, 4), 16)) / 4 }) },
  { cmd: '010D', parse: (h) => ({ speed: parseInt(h.slice(0, 2), 16) }) },
  { cmd: '0110', parse: (h) => ({ maf: (parseInt(h.slice(0, 2), 16) * 256 + parseInt(h.slice(2, 4), 16)) / 100 }) },
  { cmd: '0111', parse: (h) => ({ throttle: parseInt(h.slice(0, 2), 16) * 100 / 255 }) },
  { cmd: '0104', parse: (h) => ({ engineLoad: parseInt(h.slice(0, 2), 16) * 100 / 255 }) },
  { cmd: '0105', parse: (h) => ({ coolant: parseInt(h.slice(0, 2), 16) - 40 }) },
  { cmd: '010F', parse: (h) => ({ iat: parseInt(h.slice(0, 2), 16) - 40 }) },
  { cmd: '010B', parse: (h) => ({ map: parseInt(h.slice(0, 2), 16) }) },
  { cmd: '0133', parse: (h) => ({ baro: parseInt(h.slice(0, 2), 16) }), optional: true }, // Barometric pressure (TB10)

  // ── Process Rate (PR) ──
  { cmd: '010E', parse: (h) => ({ timing: parseInt(h.slice(0, 2), 16) / 2 - 64 }) },
  { cmd: '0106', parse: (h) => ({ stftB1: (parseInt(h.slice(0, 2), 16) - 128) * 100 / 128 }) },
  { cmd: '0107', parse: (h) => ({ ltftB1: (parseInt(h.slice(0, 2), 16) - 128) * 100 / 128 }) },
  { cmd: '0108', parse: (h) => ({ stftB2: (parseInt(h.slice(0, 2), 16) - 128) * 100 / 128 }), optional: true }, // Bank 2 STFT (PR4)
  { cmd: '0109', parse: (h) => ({ ltftB2: (parseInt(h.slice(0, 2), 16) - 128) * 100 / 128 }), optional: true }, // Bank 2 LTFT (PR5)
  { cmd: '0143', parse: (h) => ({ absLoad: (parseInt(h.slice(0, 2), 16) * 256 + parseInt(h.slice(2, 4), 16)) * 100 / 255 }), optional: true }, // Absolute load (PR8)

  // ── Flow State (FS) ──
  { cmd: '0114', parse: (h) => ({ o2B1S1: parseInt(h.slice(0, 2), 16) / 200 }) },                    // O2 upstream B1 (FS1)
  { cmd: '0115', parse: (h) => ({ o2B1S2: parseInt(h.slice(0, 2), 16) / 200 }), optional: true },    // O2 downstream B1 (FS2)
  { cmd: '013C', parse: (h) => ({ catTempB1: (parseInt(h.slice(0, 2), 16) * 256 + parseInt(h.slice(2, 4), 16)) / 10 - 40 }), optional: true }, // Catalyst temp (FS5)

  // ── System Lifecycle (SL) ──
  { cmd: '0142', parse: (h) => ({ battery: (parseInt(h.slice(0, 2), 16) * 256 + parseInt(h.slice(2, 4), 16)) / 1000 }) },
  { cmd: '0101', parse: (h) => ({ mil: (parseInt(h.slice(0, 2), 16) & 0x80) ? 1 : 0, dtcCount: parseInt(h.slice(0, 2), 16) & 0x7F }) },
  { cmd: '011F', parse: (h) => ({ runtimeSinceStart: parseInt(h.slice(0, 2), 16) * 256 + parseInt(h.slice(2, 4), 16) }), optional: true }, // Engine runtime (SL4)
  { cmd: '0146', parse: (h) => ({ ambientTemp: parseInt(h.slice(0, 2), 16) - 40 }), optional: true }, // Ambient air temp
];

// Track which optional PIDs this vehicle supports (queried once after connect)
let supportedPIDs: Set<string> = new Set();
let pidSupportQueried = false;

// ═══════════════════════════════════════════════════════════════
// Permissions
// ═══════════════════════════════════════════════════════════════

async function requestPermissions(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;

  try {
    // Android 12+ (API 31+) requires BLUETOOTH_SCAN and BLUETOOTH_CONNECT
    // Android 11 and below require ACCESS_FINE_LOCATION
    const apiLevel = Platform.Version;
    
    if (typeof apiLevel === 'number' && apiLevel >= 31) {
      const granted = await PermissionsAndroid.requestMultiple([
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
      ]);
      return Object.values(granted).every(v => v === PermissionsAndroid.RESULTS.GRANTED);
    } else {
      const granted = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
      );
      return granted === PermissionsAndroid.RESULTS.GRANTED;
    }
  } catch {
    return false;
  }
}

// ═══════════════════════════════════════════════════════════════
// Base64 Encode/Decode (BLE data transport)
// ═══════════════════════════════════════════════════════════════

function decodeBase64(base64: string): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let result = '';
  let bits = 0;
  let value = 0;
  for (const c of base64) {
    if (c === '=') break;
    const idx = chars.indexOf(c);
    if (idx < 0) continue;
    value = (value << 6) | idx;
    bits += 6;
    while (bits >= 8) {
      bits -= 8;
      result += String.fromCharCode((value >> bits) & 0xFF);
    }
  }
  return result;
}

function encodeBase64(str: string): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let result = '';
  let i = 0;
  while (i < str.length) {
    const a = str.charCodeAt(i++);
    const b = i < str.length ? str.charCodeAt(i++) : 0;
    const c = i < str.length ? str.charCodeAt(i++) : 0;
    const triplet = (a << 16) | (b << 8) | c;
    result += chars[(triplet >> 18) & 0x3F];
    result += chars[(triplet >> 12) & 0x3F];
    result += i - 2 < str.length ? chars[(triplet >> 6) & 0x3F] : '=';
    result += i - 1 < str.length ? chars[triplet & 0x3F] : '=';
  }
  return result;
}

// ═══════════════════════════════════════════════════════════════
// Device Name Matching
// ═══════════════════════════════════════════════════════════════

function isOBDAdapter(device: Device): boolean {
  const name = (device.name || device.localName || '').toLowerCase();
  if (!name || name.length < 2) return false;
  return ADAPTER_NAME_PATTERNS.some(pattern => name.includes(pattern));
}

// ═══════════════════════════════════════════════════════════════
// Characteristic Discovery
// ═══════════════════════════════════════════════════════════════

/**
 * After connecting, discover the TX (write) and RX (notify) characteristics.
 * 
 * Strategy:
 * 1. Try known service UUIDs first
 * 2. Fall back to scanning ALL services for compatible characteristics
 * 3. Prefer a single characteristic that supports both write + notify (most common)
 * 4. If not found, use separate TX (writable) and RX (notifiable) characteristics
 */
async function discoverCharacteristics(device: Device): Promise<{ tx: Characteristic; rx: Characteristic } | null> {
  let bestTx: Characteristic | null = null;
  let bestRx: Characteristic | null = null;
  let dualChar: Characteristic | null = null; // Single char that does both

  const services = await device.services();
  
  for (const service of services) {
    let chars: Characteristic[];
    try {
      chars = await device.characteristicsForService(service.uuid);
    } catch {
      continue;
    }

    for (const char of chars) {
      const isWritable = char.isWritableWithResponse || char.isWritableWithoutResponse;
      const isNotifiable = char.isNotifiable || char.isIndicatable;
      const isKnown = KNOWN_CHAR_UUIDS.includes(char.uuid.toLowerCase());

      // Best case: single characteristic handles both directions
      if (isWritable && isNotifiable) {
        dualChar = char;
        console.log(`[LumeScan] Found dual TX/RX characteristic: ${char.uuid} on service ${service.uuid}`);
        // If it's a known UUID, use it immediately
        if (isKnown) {
          return { tx: char, rx: char };
        }
      }

      // Track best separate candidates
      if (isWritable && (!bestTx || isKnown)) {
        bestTx = char;
      }
      if (isNotifiable && (!bestRx || isKnown)) {
        bestRx = char;
      }
    }
  }

  // Prefer dual characteristic
  if (dualChar) {
    return { tx: dualChar, rx: dualChar };
  }

  // Fall back to separate TX/RX
  if (bestTx && bestRx) {
    console.log(`[LumeScan] Using separate TX: ${bestTx.uuid}, RX: ${bestRx.uuid}`);
    return { tx: bestTx, rx: bestRx };
  }

  // Last resort: if we only found a writable char, try using it for notifications too
  if (bestTx) {
    console.warn(`[LumeScan] Only found writable char, attempting read-based polling`);
    return { tx: bestTx, rx: bestTx };
  }

  return null;
}

// ═══════════════════════════════════════════════════════════════
// ELM327 Command Protocol
// ═══════════════════════════════════════════════════════════════

/**
 * Send an AT/OBD command and wait for the ELM327 prompt character (>)
 */
async function sendBLECommand(cmd: string, timeoutMs: number = 3000): Promise<string> {
  if (!txCharacteristic || !connectedDevice) return '';

  return new Promise((resolve) => {
    responseResolve = resolve;
    responseBuffer = '';

    const data = encodeBase64(cmd + '\r');
    
    // Try writeWithResponse first, fall back to writeWithoutResponse
    const writePromise = txCharacteristic!.isWritableWithResponse
      ? txCharacteristic!.writeWithResponse(data)
      : txCharacteristic!.writeWithoutResponse(data);
    
    writePromise.catch((err) => {
      console.warn(`[LumeScan] Write error (${cmd}):`, err?.message);
      resolve('');
    });

    // Timeout — resolve with whatever we have
    setTimeout(() => {
      if (responseResolve) {
        const partial = responseBuffer.replace(/[\r\n>]/g, '').trim();
        responseResolve(partial);
        responseResolve = null;
        responseBuffer = '';
      }
    }, timeoutMs);
  });
}

/**
 * Set up BLE notification monitoring on the RX characteristic.
 * ELM327 sends data in chunks — we buffer until we see the '>' prompt.
 */
function setupNotifications(): boolean {
  const monitorChar = rxCharacteristic || txCharacteristic;
  if (!monitorChar) return false;

  // Clean up existing subscription
  if (notificationSub) {
    notificationSub.remove();
    notificationSub = null;
  }

  try {
    notificationSub = monitorChar.monitor((error, char) => {
      if (error) {
        console.warn('[LumeScan] Notification error:', error.message);
        return;
      }
      if (!char?.value) return;

      const chunk = decodeBase64(char.value);
      responseBuffer += chunk;

      // ELM327 sends '>' when it's ready for the next command
      if (responseBuffer.includes('>')) {
        const response = responseBuffer.replace(/>/g, '').replace(/\r/g, '\n').trim();
        responseBuffer = '';
        if (responseResolve) {
          responseResolve(response);
          responseResolve = null;
        }
      }
    });
    return true;
  } catch (err: any) {
    console.error('[LumeScan] Failed to setup notifications:', err?.message);
    return false;
  }
}

// ═══════════════════════════════════════════════════════════════
// Main Connection Flow
// ═══════════════════════════════════════════════════════════════

/**
 * Scan for, connect to, and initialize a BLE OBD-II adapter.
 * Works with ANY BLE 4.0+ ELM327-compatible adapter.
 */
export async function connectBLENative(
  onStatusChange: (status: BLEConnection) => void
): Promise<boolean> {
  // Request permissions
  const permsOk = await requestPermissions();
  if (!permsOk) {
    connectionState = { status: 'error', deviceName: null, error: 'Bluetooth permissions denied. Please enable in Settings.', isSimulated: false, adapterInfo: null };
    onStatusChange({ ...connectionState });
    return false;
  }

  // Check Bluetooth state
  const btState = await manager.state();
  if (btState !== 'PoweredOn') {
    connectionState = { status: 'error', deviceName: null, error: 'Bluetooth is turned off. Please enable Bluetooth.', isSimulated: false, adapterInfo: null };
    onStatusChange({ ...connectionState });
    return false;
  }

  connectionState = { status: 'scanning', deviceName: null, error: null, isSimulated: false, adapterInfo: null };
  onStatusChange({ ...connectionState });

  return new Promise((resolve) => {
    let found = false;

    // 15 second scan timeout
    const timeout = setTimeout(() => {
      if (!found) {
        manager.stopDeviceScan();
        connectionState = {
          status: 'error', deviceName: null,
          error: 'No OBD-II adapter found. Make sure it\'s plugged in and the ignition is ON.',
          isSimulated: false, adapterInfo: null,
        };
        onStatusChange({ ...connectionState });
        resolve(false);
      }
    }, 15000);

    // Scan for ALL BLE devices (null = no UUID filter)
    manager.startDeviceScan(null, { allowDuplicates: false }, async (error, device) => {
      if (error || !device || found) return;

      // Match by device name
      if (!isOBDAdapter(device)) return;

      found = true;
      manager.stopDeviceScan();
      clearTimeout(timeout);

      const name = device.name || device.localName || 'OBD-II Adapter';
      console.log(`[LumeScan] Found adapter: "${name}" (${device.id})`);

      connectionState = { status: 'connecting', deviceName: name, error: null, isSimulated: false, adapterInfo: null };
      onStatusChange({ ...connectionState });

      try {
        // Connect with timeout
        connectedDevice = await device.connect({ timeout: 8000 });
        
        // Negotiate MTU before discovering services (Crucial for Android)
        if (Platform.OS === 'android') {
          try {
            await connectedDevice.requestMTU(512);
            console.log('[LumeScan] Negotiated MTU to 512 bytes');
          } catch (e: any) {
            console.warn('[LumeScan] MTU negotiation failed (often ignorable):', e?.message);
          }
        }
        
        await connectedDevice.discoverAllServicesAndCharacteristics();

        // Discover TX/RX characteristics
        const chars = await discoverCharacteristics(connectedDevice);
        if (!chars) {
          throw new Error('No compatible OBD-II characteristics found on this adapter. It may not be ELM327-compatible.');
        }

        txCharacteristic = chars.tx;
        rxCharacteristic = chars.rx;

        // Setup notification monitoring on RX characteristic
        const notifyOk = setupNotifications();
        if (!notifyOk) {
          console.warn('[LumeScan] Notification setup failed — will try read-based polling');
        }

        // Initialize ELM327 protocol
        connectionState = { status: 'initializing', deviceName: name, error: null, isSimulated: false, adapterInfo: null };
        onStatusChange({ ...connectionState });

        // Reset adapter
        await sendBLECommand('ATZ', 5000);
        await delay(1500);

        // Configure for OBD-II
        await sendBLECommand('ATE0');      // Echo off
        await delay(100);
        await sendBLECommand('ATL0');      // Linefeeds off  
        await delay(100);
        await sendBLECommand('ATS0');      // Spaces off (compact hex responses)
        await delay(100);
        await sendBLECommand('ATH0');      // Headers off
        await delay(100);
        await sendBLECommand('ATSP0');     // Auto-detect vehicle protocol
        await delay(100);

        // Get adapter firmware info
        const info = await sendBLECommand('ATI');
        const firmwareInfo = info ? info.split('\n').filter(l => l.trim()).join(' ') : '';

        // Test connectivity — read RPM (will return "NO DATA" if engine off, but proves protocol works)
        const testResponse = await sendBLECommand('010C', 3000);
        const testOk = testResponse && !testResponse.includes('UNABLE') && !testResponse.includes('ERROR');
        
        if (!testOk) {
          // Try setting protocol explicitly for common protocols
          console.warn('[LumeScan] Auto-protocol failed, trying CAN 11-bit 500k (most common)...');
          await sendBLECommand('ATSP6');   // ISO 15765-4 CAN (11 bit, 500 kbaud)
          await delay(500);
          const retry = await sendBLECommand('010C', 3000);
          if (!retry || retry.includes('UNABLE') || retry.includes('ERROR')) {
            console.warn('[LumeScan] Protocol 6 failed, trying protocol 8 (CAN 11-bit 250k)...');
            await sendBLECommand('ATSP8');
            await delay(500);
          }
        }

        connectionState = {
          status: 'connected', deviceName: name, error: null,
          isSimulated: false,
          adapterInfo: firmwareInfo || `BLE: ${name}`,
        };
        onStatusChange({ ...connectionState });
        startTime = Date.now();
        rawValues = {}; // Reset values for new connection

        // Handle unexpected disconnect
        manager.onDeviceDisconnected(connectedDevice.id, () => {
          console.log('[LumeScan] Device disconnected');
          connectionState = { status: 'disconnected', deviceName: null, error: null, isSimulated: false, adapterInfo: null };
          onStatusChange({ ...connectionState });
          cleanup();
        });

        resolve(true);
      } catch (err: any) {
        console.error('[LumeScan] Connection error:', err?.message);
        connectionState = {
          status: 'error', deviceName: name,
          error: err?.message || 'Connection failed — try again',
          isSimulated: false, adapterInfo: null,
        };
        onStatusChange({ ...connectionState });
        cleanup();
        resolve(false);
      }
    });
  });
}

// ═══════════════════════════════════════════════════════════════
// PID Reading & Telemetry
// ═══════════════════════════════════════════════════════════════

async function readPID(cmd: string): Promise<string> {
  const response = await sendBLECommand(cmd, 2000);
  if (!response || response.includes('NO DATA') || response.includes('ERROR') || response.includes('UNABLE')) return '';
  // Extract hex data after the mode+PID response header
  // Response format: "410CXXXX" (spaces off) or "41 0C XX XX" (spaces on)
  const clean = response.replace(/[\s\r\n]/g, '');
  // Find the response pattern (41XX for Mode 01)
  const modeResponse = '41' + cmd.slice(2, 4).toUpperCase();
  const idx = clean.toUpperCase().indexOf(modeResponse);
  if (idx >= 0) {
    return clean.substring(idx + 4); // Skip "41XX"
  }
  // Fallback: just skip first 4 chars
  return clean.length >= 6 ? clean.substring(4) : '';
}

/**
 * Decode DTC bytes — shared by Mode 03, 07, and 0A
 */
function decodeDTCBytes(data: string): string[] {
  const dtcs: string[] = [];
  for (let i = 0; i + 3 < data.length; i += 4) {
    const byte1 = parseInt(data.slice(i, i + 2), 16);
    const byte2 = parseInt(data.slice(i + 2, i + 4), 16);
    if (byte1 === 0 && byte2 === 0) continue; // Padding
    
    const category = ['P', 'C', 'B', 'U'][(byte1 >> 6) & 0x03];
    const digit2 = (byte1 >> 4) & 0x03;
    const digit3 = byte1 & 0x0F;
    const digit4 = (byte2 >> 4) & 0x0F;
    const digit5 = byte2 & 0x0F;
    dtcs.push(`${category}${digit2}${digit3.toString(16)}${digit4.toString(16)}${digit5.toString(16)}`.toUpperCase());
  }
  return dtcs;
}

// ═══════════════════════════════════════════════════════════════
// Mode 02 — Freeze Frame Data
// Snapshot of PID values at the moment the last DTC was stored.
// Same PIDs as Mode 01, prefix "02" + PID + frame number (00).
// ═══════════════════════════════════════════════════════════════

export interface FreezeFrameData {
  dtcTrigger: string;   // The DTC that triggered this freeze frame
  rpm?: number;
  speed?: number;
  coolant?: number;
  engineLoad?: number;
  throttle?: number;
  stftB1?: number;
  ltftB1?: number;
  map?: number;
  timing?: number;
  iat?: number;
  maf?: number;
}

export async function readFreezeFrame(): Promise<FreezeFrameData | null> {
  // First, read DTC that triggered the freeze frame (PID 02 in Mode 02)
  const dtcResponse = await sendBLECommand('0202\r', 3000);
  if (!dtcResponse || dtcResponse.includes('NO DATA')) return null;

  const ff: FreezeFrameData = { dtcTrigger: '' };

  // Parse the trigger DTC from Mode 02 PID 02
  const dtcClean = dtcResponse.replace(/[\s\r\n]/g, '');
  const dtcIdx = dtcClean.toUpperCase().indexOf('4202');
  if (dtcIdx >= 0) {
    const dtcHex = dtcClean.substring(dtcIdx + 4);
    const decoded = decodeDTCBytes(dtcHex);
    if (decoded.length > 0) ff.dtcTrigger = decoded[0];
  }

  // Read key PIDs from the freeze frame (frame 00)
  const ffPids: { cmd: string; key: keyof FreezeFrameData; parse: (h: string) => number }[] = [
    { cmd: '020C00', key: 'rpm', parse: h => (parseInt(h.slice(0, 2), 16) * 256 + parseInt(h.slice(2, 4), 16)) / 4 },
    { cmd: '020D00', key: 'speed', parse: h => parseInt(h.slice(0, 2), 16) },
    { cmd: '020500', key: 'coolant', parse: h => parseInt(h.slice(0, 2), 16) - 40 },
    { cmd: '020400', key: 'engineLoad', parse: h => parseInt(h.slice(0, 2), 16) * 100 / 255 },
    { cmd: '021100', key: 'throttle', parse: h => parseInt(h.slice(0, 2), 16) * 100 / 255 },
    { cmd: '020600', key: 'stftB1', parse: h => (parseInt(h.slice(0, 2), 16) - 128) * 100 / 128 },
    { cmd: '020700', key: 'ltftB1', parse: h => (parseInt(h.slice(0, 2), 16) - 128) * 100 / 128 },
    { cmd: '020B00', key: 'map', parse: h => parseInt(h.slice(0, 2), 16) },
    { cmd: '020E00', key: 'timing', parse: h => parseInt(h.slice(0, 2), 16) / 2 - 64 },
    { cmd: '020F00', key: 'iat', parse: h => parseInt(h.slice(0, 2), 16) - 40 },
    { cmd: '021000', key: 'maf', parse: h => (parseInt(h.slice(0, 2), 16) * 256 + parseInt(h.slice(2, 4), 16)) / 100 },
  ];

  for (const { cmd, key, parse } of ffPids) {
    const response = await sendBLECommand(cmd + '\r', 2000);
    if (!response || response.includes('NO DATA')) continue;
    const clean = response.replace(/[\s\r\n]/g, '');
    // Mode 02 response starts with "42" + PID
    const pidHex = cmd.slice(2, 4).toUpperCase();
    const respHeader = `42${pidHex}`;
    const idx = clean.toUpperCase().indexOf(respHeader);
    if (idx >= 0) {
      const data = clean.substring(idx + respHeader.length);
      // Skip frame byte (00) — it's 2 chars
      const valueData = data.length > 2 ? data.substring(2) : data;
      try {
        (ff as any)[key] = parse(valueData);
      } catch { /* skip */ }
    }
  }

  return ff.dtcTrigger || ff.rpm !== undefined ? ff : null;
}

// ═══════════════════════════════════════════════════════════════
// Mode 03 — Read Active (Confirmed) DTCs
// ═══════════════════════════════════════════════════════════════

export async function readDTCs(): Promise<string[]> {
  const response = await sendBLECommand('03', 5000);
  if (!response || response.includes('NO DATA')) return [];
  
  const clean = response.replace(/[\s\r\n]/g, '');
  const idx = clean.indexOf('43');
  if (idx < 0) return [];
  
  return decodeDTCBytes(clean.substring(idx + 2));
}

// ═══════════════════════════════════════════════════════════════
// Mode 04 — Clear DTCs and Reset MIL
// WARNING: Clears all stored DTCs, freeze frame, and resets monitors.
// Vehicle will need to complete a full drive cycle to pass emissions.
// ═══════════════════════════════════════════════════════════════

export async function clearDTCs(): Promise<{ success: boolean; message: string }> {
  try {
    const response = await sendBLECommand('04', 5000);
    if (!response) {
      return { success: false, message: 'No response from vehicle ECU' };
    }
    if (response.includes('44') || response.includes('OK')) {
      console.log('[LumeScan] DTCs cleared successfully');
      return { success: true, message: 'All trouble codes cleared. Check engine light will turn off. Drive cycle monitors have been reset — you will need to complete a full drive cycle before emissions testing.' };
    }
    if (response.includes('ERROR') || response.includes('UNABLE')) {
      return { success: false, message: 'ECU rejected the clear command. The vehicle may require the engine to be running.' };
    }
    return { success: false, message: `Unexpected response: ${response.substring(0, 40)}` };
  } catch (e: any) {
    return { success: false, message: `Communication error: ${e.message || 'Unknown'}` };
  }
}

// ═══════════════════════════════════════════════════════════════
// Mode 05 — O2 Sensor Monitoring Test Results
// Returns rich/lean switch times, voltage thresholds, and sensor
// response characteristics. Not supported on all CAN vehicles —
// many post-2008 vehicles moved this data to Mode 06.
// ═══════════════════════════════════════════════════════════════

export interface O2TestResult {
  testId: number;
  testName: string;
  sensorLocation: string;  // e.g., "Bank 1, Sensor 1"
  value: number;
  unit: string;
  minLimit?: number;
  maxLimit?: number;
  passed?: boolean;
}

const O2_TEST_NAMES: Record<number, { name: string; unit: string; scale: number }> = {
  0x01: { name: 'Rich-to-Lean Threshold Voltage', unit: 'V', scale: 0.005 },
  0x02: { name: 'Lean-to-Rich Threshold Voltage', unit: 'V', scale: 0.005 },
  0x03: { name: 'Low Voltage Switch Time', unit: 'ms', scale: 0.004 },
  0x04: { name: 'High Voltage Switch Time', unit: 'ms', scale: 0.004 },
  0x05: { name: 'Rich-to-Lean Switch Time', unit: 'ms', scale: 0.004 },
  0x06: { name: 'Lean-to-Rich Switch Time', unit: 'ms', scale: 0.004 },
  0x07: { name: 'Minimum Sensor Voltage', unit: 'V', scale: 0.005 },
  0x08: { name: 'Maximum Sensor Voltage', unit: 'V', scale: 0.005 },
  0x09: { name: 'Transition Time', unit: 'ms', scale: 0.004 },
};

const O2_SENSOR_LOCATIONS: Record<number, string> = {
  0x01: 'Bank 1, Sensor 1',
  0x02: 'Bank 1, Sensor 2',
  0x03: 'Bank 1, Sensor 3',
  0x04: 'Bank 1, Sensor 4',
  0x05: 'Bank 2, Sensor 1',
  0x06: 'Bank 2, Sensor 2',
  0x07: 'Bank 2, Sensor 3',
  0x08: 'Bank 2, Sensor 4',
};

export async function readO2SensorTests(): Promise<O2TestResult[]> {
  const results: O2TestResult[] = [];

  // Query each test ID (01-09) for each sensor (01-08)
  // Only query common combinations to avoid timeouts
  for (let testId = 0x01; testId <= 0x09; testId++) {
    for (let sensor = 0x01; sensor <= 0x04; sensor++) {
      const cmd = `05${testId.toString(16).padStart(2, '0')}${sensor.toString(16).padStart(2, '0')}`;
      const response = await sendBLECommand(cmd + '\r', 2000);
      if (!response || response.includes('NO DATA') || response.includes('ERROR')) continue;

      const clean = response.replace(/[\s\r\n]/g, '');
      const header = `45${testId.toString(16).padStart(2, '0').toUpperCase()}`;
      const idx = clean.toUpperCase().indexOf(header);
      if (idx < 0) continue;

      const data = clean.substring(idx + 4);
      if (data.length < 4) continue;

      const testDef = O2_TEST_NAMES[testId];
      if (!testDef) continue;

      // Parse the value (2 bytes)
      const rawValue = parseInt(data.slice(0, 4), 16);
      const value = rawValue * testDef.scale;

      results.push({
        testId,
        testName: testDef.name,
        sensorLocation: O2_SENSOR_LOCATIONS[sensor] || `Sensor ${sensor}`,
        value,
        unit: testDef.unit,
      });
    }
  }

  console.log(`[LumeScan] Mode 05: ${results.length} O2 sensor test results`);
  return results;
}

// ═══════════════════════════════════════════════════════════════
// Mode 06 — On-Board Monitoring Test Results
// The dealer-level mode. Returns actual test values vs pass/fail
// thresholds for every emissions monitor: catalyst, misfire, EVAP,
// O2 sensors, EGR, etc. This is what makes predictive diagnostics
// possible — you can see a component at 87% of its failure threshold.
// ═══════════════════════════════════════════════════════════════

export interface Mode06TestResult {
  mid: number;          // Monitor ID (Test Group)
  midName: string;      // e.g., "Catalyst Monitor Bank 1"
  tid: number;          // Test ID within the monitor
  tidName: string;      // e.g., "Catalyst Efficiency"
  value: number;        // Actual measured value
  minLimit: number;     // Minimum acceptable value
  maxLimit: number;     // Maximum acceptable value
  unit: string;
  passed: boolean;      // Did it pass?
  percentToFail: number; // 0-100%, how close to failure threshold
}

// SAE J1979 Monitor IDs (MIDs) — covers the major test groups
const MID_NAMES: Record<number, string> = {
  0x01: 'Catalyst Monitor Bank 1',
  0x02: 'Catalyst Monitor Bank 2',
  0x03: 'Catalyst Heater Monitor',
  0x05: 'Evaporative System Monitor',
  0x06: 'Oxygen Sensor Monitor Bank 1',
  0x07: 'Oxygen Sensor Monitor Bank 2',
  0x08: 'Oxygen Sensor Heater Monitor',
  0x09: 'EGR/VVT System Monitor',
  0x0A: 'Secondary Air System Monitor',
  0x0B: 'A/C Refrigerant Monitor',
  0x21: 'Catalyst Monitor (NMHC)',
  0x22: 'NOx/SCR Catalyst Monitor',
  0x31: 'Misfire Monitor Cylinder 1',
  0x32: 'Misfire Monitor Cylinder 2',
  0x33: 'Misfire Monitor Cylinder 3',
  0x34: 'Misfire Monitor Cylinder 4',
  0x35: 'Misfire Monitor Cylinder 5',
  0x36: 'Misfire Monitor Cylinder 6',
  0x37: 'Misfire Monitor Cylinder 7',
  0x38: 'Misfire Monitor Cylinder 8',
  0x39: 'Misfire Monitor General',
  0x41: 'A/C System Monitor',
  0xA0: 'Manufacturer Specific',
};

// Common Test IDs within monitors
const TID_NAMES: Record<number, { name: string; unit: string }> = {
  0x01: { name: 'Rich-to-Lean Response', unit: 'ms' },
  0x02: { name: 'Lean-to-Rich Response', unit: 'ms' },
  0x03: { name: 'Low Sensor Voltage', unit: 'V' },
  0x04: { name: 'High Sensor Voltage', unit: 'V' },
  0x05: { name: 'Voltage Amplitude', unit: 'V' },
  0x06: { name: 'Sensor Period', unit: 'ms' },
  0x07: { name: 'Minimum Test Value', unit: '' },
  0x08: { name: 'Maximum Test Value', unit: '' },
  0x09: { name: 'Average Test Value', unit: '' },
  0x0A: { name: 'Test Count', unit: 'count' },
  0x80: { name: 'Efficiency Ratio', unit: '%' },
  0x81: { name: 'Misfire Count', unit: 'count' },
  0x82: { name: 'EVAP Leak Pressure', unit: 'Pa' },
  0x83: { name: 'Catalyst Light-off Time', unit: 's' },
  0x84: { name: 'EGR Flow Rate', unit: 'g/s' },
};

/**
 * Read Mode 06 test results for a specific Monitor ID (MID).
 * CAN protocol format: 06 XX where XX = MID
 * Response: 46 MID TID value min max (each 2 bytes)
 */
async function readMode06MID(mid: number): Promise<Mode06TestResult[]> {
  const results: Mode06TestResult[] = [];
  const cmd = `06${mid.toString(16).padStart(2, '0')}`;
  const response = await sendBLECommand(cmd + '\r', 3000);
  if (!response || response.includes('NO DATA') || response.includes('ERROR')) return results;

  const clean = response.replace(/[\s\r\n]/g, '');
  const header = '46';
  let pos = 0;

  // CAN responses may contain multiple test results
  while (pos < clean.length) {
    const idx = clean.toUpperCase().indexOf(header, pos);
    if (idx < 0 || idx + 14 > clean.length) break;

    // Format: 46 MID TID ValueHi ValueLo MinHi MinLo MaxHi MaxLo
    // Each field is 1 byte (2 hex chars) = 14 chars total
    const midByte = parseInt(clean.slice(idx + 2, idx + 4), 16);
    const tid = parseInt(clean.slice(idx + 4, idx + 6), 16);
    const value = parseInt(clean.slice(idx + 6, idx + 10), 16);
    const minLimit = parseInt(clean.slice(idx + 10, idx + 14), 16);
    // Some responses have max limit, some don't
    let maxLimit = 0xFFFF;
    if (idx + 18 <= clean.length) {
      maxLimit = parseInt(clean.slice(idx + 14, idx + 18), 16);
      pos = idx + 18;
    } else {
      pos = idx + 14;
    }

    if (isNaN(midByte) || isNaN(tid) || isNaN(value)) { pos = idx + 2; continue; }

    const midName = MID_NAMES[midByte] || `Monitor 0x${midByte.toString(16).toUpperCase()}`;
    const tidDef = TID_NAMES[tid] || { name: `Test 0x${tid.toString(16).toUpperCase()}`, unit: '' };
    const passed = value >= minLimit && value <= maxLimit;

    // Calculate how close to failure (0% = perfect, 100% = at threshold)
    let percentToFail = 0;
    if (maxLimit > minLimit) {
      const range = maxLimit - minLimit;
      const distFromCenter = Math.abs(value - (minLimit + range / 2));
      percentToFail = Math.min(100, (distFromCenter / (range / 2)) * 100);
    }

    results.push({
      mid: midByte, midName,
      tid, tidName: tidDef.name,
      value, minLimit, maxLimit,
      unit: tidDef.unit,
      passed,
      percentToFail: Math.round(percentToFail),
    });
  }

  return results;
}

/**
 * Read all available Mode 06 test results.
 * Queries the most common MIDs. Skip quickly on NO DATA.
 */
export async function readAllMode06(): Promise<Mode06TestResult[]> {
  const allResults: Mode06TestResult[] = [];

  // Query the most important MIDs first
  const midsToQuery = [
    0x01, 0x02,        // Catalyst
    0x05,              // EVAP
    0x06, 0x07,        // O2 Sensors
    0x08,              // O2 Heaters
    0x09,              // EGR/VVT
    0x31, 0x32, 0x33, 0x34, 0x35, 0x36, 0x37, 0x38, // Misfires per cylinder
    0x39,              // Misfire general
    0x21, 0x22,        // NMHC / NOx catalyst
  ];

  for (const mid of midsToQuery) {
    const results = await readMode06MID(mid);
    allResults.push(...results);
  }

  console.log(`[LumeScan] Mode 06: ${allResults.length} on-board monitoring test results`);
  return allResults;
}

// ═══════════════════════════════════════════════════════════════
// Mode 07 — Read Pending (Drive-Cycle Incomplete) DTCs
// These are codes that have been detected but haven't confirmed
// across enough drive cycles to set the MIL. The "early warning"
// system — you can see a P0420 forming before the light comes on.
// ═══════════════════════════════════════════════════════════════

export async function readPendingDTCs(): Promise<string[]> {
  const response = await sendBLECommand('07', 5000);
  if (!response || response.includes('NO DATA')) return [];
  
  const clean = response.replace(/[\s\r\n]/g, '');
  const idx = clean.indexOf('47');
  if (idx < 0) return [];
  
  return decodeDTCBytes(clean.substring(idx + 2));
}

// ═══════════════════════════════════════════════════════════════
// Mode 09 — Vehicle Information
// VIN, Calibration ID, CVN, ECU name, and more.
// ═══════════════════════════════════════════════════════════════

export interface VehicleInfo {
  vin?: string;             // 17-char VIN
  calibrationId?: string;   // ECU calibration ID
  cvn?: string;             // Calibration Verification Number
  ecuName?: string;          // ECU name/label
  inUseTracking?: string;   // In-use performance tracking
}

/**
 * Decode ASCII from hex pairs.
 */
function hexToAscii(hex: string): string {
  let str = '';
  for (let i = 0; i < hex.length; i += 2) {
    const charCode = parseInt(hex.slice(i, i + 2), 16);
    if (charCode > 31 && charCode < 127) str += String.fromCharCode(charCode);
  }
  return str.trim();
}

export async function readVehicleInfo(): Promise<VehicleInfo> {
  const info: VehicleInfo = {};

  // PID 02 — VIN (17 characters)
  const vinResp = await sendBLECommand('0902\r', 5000);
  if (vinResp && !vinResp.includes('NO DATA')) {
    const clean = vinResp.replace(/[\s\r\n]/g, '');
    // Response: 4902 01 XXXXXXXXXX... (multi-line possible)
    // Find "4902" header, skip count byte, rest is VIN in hex
    const idx = clean.toUpperCase().indexOf('4902');
    if (idx >= 0) {
      // Skip header (4902) + count byte (2 chars) = 6 chars
      const vinHex = clean.substring(idx + 6);
      const vin = hexToAscii(vinHex);
      if (vin.length >= 17) info.vin = vin.substring(0, 17);
      else if (vin.length > 0) info.vin = vin;
    }
  }

  // PID 04 — Calibration ID
  const calResp = await sendBLECommand('0904\r', 3000);
  if (calResp && !calResp.includes('NO DATA')) {
    const clean = calResp.replace(/[\s\r\n]/g, '');
    const idx = clean.toUpperCase().indexOf('4904');
    if (idx >= 0) {
      const calHex = clean.substring(idx + 6);
      info.calibrationId = hexToAscii(calHex) || undefined;
    }
  }

  // PID 06 — CVN (Calibration Verification Number)
  const cvnResp = await sendBLECommand('0906\r', 3000);
  if (cvnResp && !cvnResp.includes('NO DATA')) {
    const clean = cvnResp.replace(/[\s\r\n]/g, '');
    const idx = clean.toUpperCase().indexOf('4906');
    if (idx >= 0) {
      info.cvn = clean.substring(idx + 6, idx + 14).toUpperCase(); // 4-byte hex
    }
  }

  // PID 0A — ECU Name
  const ecuResp = await sendBLECommand('090A\r', 3000);
  if (ecuResp && !ecuResp.includes('NO DATA')) {
    const clean = ecuResp.replace(/[\s\r\n]/g, '');
    const idx = clean.toUpperCase().indexOf('490A');
    if (idx >= 0) {
      const ecuHex = clean.substring(idx + 6);
      info.ecuName = hexToAscii(ecuHex) || undefined;
    }
  }

  if (info.vin) {
    console.log(`[LumeScan] Mode 09: VIN = ${info.vin}`);
  }

  return info;
}

// ═══════════════════════════════════════════════════════════════
// Mode 0A — Permanent DTCs
// These CANNOT be cleared by Mode 04 or by disconnecting the
// battery. They are only cleared by the ECU itself after the
// vehicle completes enough drive cycles proving the fault is gone.
// If a vehicle has permanent DTCs, it WILL fail emissions testing.
// ═══════════════════════════════════════════════════════════════

export async function readPermanentDTCs(): Promise<string[]> {
  const response = await sendBLECommand('0A', 5000);
  if (!response || response.includes('NO DATA')) return [];
  
  const clean = response.replace(/[\s\r\n]/g, '');
  const idx = clean.indexOf('4A');
  if (idx < 0) return [];
  
  return decodeDTCBytes(clean.substring(idx + 2));
}

/**
 * Query supported PIDs from the vehicle (called once after first connect).
 * PIDs 0100, 0120, 0140 return bitmasks of which PIDs the ECU supports.
 */
async function querySupportedPIDs(): Promise<void> {
  if (pidSupportQueried) return;
  pidSupportQueried = true;

  const ranges = [
    { cmd: '0100', startPid: 0x01 },
    { cmd: '0120', startPid: 0x21 },
    { cmd: '0140', startPid: 0x41 },
  ];

  for (const { cmd, startPid } of ranges) {
    const hex = await readPID(cmd);
    if (!hex || hex.length < 8) continue;

    // Parse 4-byte bitmask (32 bits = 32 PIDs)
    const mask = parseInt(hex.slice(0, 8), 16);
    for (let bit = 0; bit < 32; bit++) {
      if (mask & (1 << (31 - bit))) {
        const pidNum = startPid + bit;
        const pidHex = pidNum.toString(16).toUpperCase().padStart(2, '0');
        supportedPIDs.add(`01${pidHex}`);
      }
    }
  }

  console.log(`[LumeScan] Vehicle supports ${supportedPIDs.size} PIDs`);
}

export async function pollAllBLEPIDs(): Promise<void> {
  if (!txCharacteristic || connectionState.status !== 'connected' || connectionState.isSimulated) return;

  // Query supported PIDs on first run
  if (!pidSupportQueried) {
    await querySupportedPIDs();
  }

  for (const { cmd, parse, optional } of PIDS) {
    // Skip optional PIDs the vehicle doesn't support (avoids slow NO DATA responses)
    if (optional && pidSupportQueried && supportedPIDs.size > 0 && !supportedPIDs.has(cmd)) {
      continue;
    }

    const hex = await readPID(cmd);
    if (hex && hex.length >= 2) {
      try {
        const values = parse(hex);
        Object.assign(rawValues, values);
      } catch {
        // Skip malformed responses — adapter noise
      }
    }
  }

  // Read DTCs periodically (every ~30 seconds, not every poll cycle)
  if (rawValues.mil && rawValues.dtcCount > 0 && Math.random() < 0.03) {
    const dtcs = await readDTCs();
    if (dtcs.length > 0) {
      (rawValues as any).activeDTCs = dtcs;
    }
  }
}

// ═══════════════════════════════════════════════════════════════
// Telemetry Snapshot Builder
// ═══════════════════════════════════════════════════════════════

function buildSnapshot(): TelemetrySnapshot {
  const r = rawValues;
  const now = Date.now();
  const runtimeSeconds = r.runtimeSinceStart || Math.floor((now - startTime) / 1000);

  // ── Derived values (computed from real signals) ──
  const afr = r.maf && r.engineLoad
    ? 14.7 + (r.stftB1 || 0) * 0.05 + (r.ltftB1 || 0) * 0.02
    : 14.7;

  // Catalyst efficiency: ratio of downstream/upstream O2 activity
  // Healthy catalyst: downstream is steady ~0.5-0.8V. Upstream oscillates 0.1-0.9V.
  // Efficiency = 100 - (downstream_variance / upstream_variance) * 100
  const upstreamO2 = r.o2B1S1 || 0.45;
  const downstreamO2 = r.o2B1S2 ?? 0.72; // Use real data if available
  const catEff = r.o2B1S2 !== undefined
    ? Math.min(99, Math.max(60, 100 - Math.abs(downstreamO2 - 0.72) * 80))
    : (upstreamO2 > 0.3 && upstreamO2 < 0.7 ? 94 : 91); // Estimate from upstream only

  // Combustion efficiency: derived from AFR quality and fuel trim convergence
  const fuelTrimMagnitude = Math.abs(r.stftB1 || 0) + Math.abs(r.ltftB1 || 0);
  const combEff = Math.min(99.5, Math.max(85, 98 - fuelTrimMagnitude * 0.3));

  // Component degradation: multi-factor health score
  let degradation = 100;
  if (r.mil) degradation -= 15;
  if ((r.dtcCount || 0) > 0) degradation -= (r.dtcCount || 0) * 5;
  if (fuelTrimMagnitude > 10) degradation -= 8;
  if ((r.coolant || 90) > 105) degradation -= 10;
  if ((r.battery || 14) < 12.5) degradation -= 10;
  if (catEff < 90) degradation -= 8;
  degradation = Math.min(100, Math.max(0, degradation));

  // MPG Recovery: % improvement from governance-optimized driving
  const baselineMPG = computeMPG(r);
  const mpgRecovery = baselineMPG > 0 && fuelTrimMagnitude < 8
    ? Math.min(18, 5 + (98 - fuelTrimMagnitude) * 0.12)
    : 0;

  return {
    timestamp: now,
    // ── Throughput Base ──
    tb1_maf: r.maf || 0,
    tb2_fuelFlow: (r.maf || 0) * 22,
    tb3_map: r.map || 0,
    tb4_iat: r.iat || 25,
    tb5_throttle: r.throttle || 0,
    tb6_rpm: r.rpm || 0,
    tb7_speed: r.speed || 0,
    tb8_volEff: r.maf && r.rpm ? Math.min(100, (r.maf / (r.rpm * 0.005)) * 100) : 85,
    tb9_afr: afr,
    tb10_baro: r.baro || 101.3, // Real PID 0133 or fallback

    // ── Process Rate ──
    pr1_timing: r.timing || 0,
    pr2_stftB1: r.stftB1 || 0,
    pr3_ltftB1: r.ltftB1 || 0,
    pr4_stftB2: r.stftB2 || 0,          // Real PID 0108 (Bank 2)
    pr5_ltftB2: r.ltftB2 || 0,          // Real PID 0109 (Bank 2)
    pr6_combEff: combEff,                // Derived from fuel trims
    pr7_engLoad: r.engineLoad || 0,
    pr8_absLoad: r.absLoad || (r.engineLoad || 0) * 0.85, // Real PID 0143 or derived

    // ── Flow State ──
    fs1_o2UpB1: upstreamO2,
    fs2_o2DnB1: downstreamO2,           // Real PID 0115 or estimated
    fs5_catTempB1: r.catTempB1 || 420,  // Real PID 013C or estimated
    fs7_catEff: catEff,                  // Derived from O2 sensors
    fs10_driverScore: computeDriverScore(r),

    // ── System Lifecycle ──
    sl1_coolant: r.coolant || 0,
    sl3_battery: r.battery || 0,
    sl4_runtime: runtimeSeconds,          // Real PID 011F or app timer
    sl7_mil: !!r.mil,
    sl8_dtcCount: r.dtcCount || 0,
    activeDTCs: (r as any).activeDTCs || [],
    sl11_degradation: degradation,        // Computed from multiple factors

    // ── Computed ──
    mpgInstant: baselineMPG,
    mpgRecovery: mpgRecovery,             // Derived from efficiency
    governanceMode: computeMode(r),
  };
}

function computeDriverScore(r: Record<string, number>): number {
  let s = 80;
  if ((r.throttle || 0) > 70) s -= 15;
  if ((r.throttle || 0) < 30) s += 10;
  if ((r.speed || 0) > 0 && (r.speed || 0) < 100) s += 5;
  return Math.min(100, Math.max(0, s));
}

function computeMPG(r: Record<string, number>): number {
  if (!r.speed || r.speed < 5 || !r.maf || r.maf < 1) return 0;
  // MPG = speed(mph) / fuel consumption (gal/hour)
  // gal/hour = (MAF g/s × 3600 s/hr) / (AFR × fuel_density_g/gal)
  // fuel_density ≈ 2,567 g/gal for gasoline
  // Simplified: gph = MAF * 0.0805 / 14.7 * 6.17
  const gph = r.maf * 0.0805 / 14.7 * 6.17;
  return gph > 0.01 ? Math.min(50, (r.speed * 0.621371) / gph) : 0;
}

// ── Governance Mode with Hysteresis ──
// Prevents seizure-like flickering by requiring a mode to be sustained
// for MIN_HOLD_MS before the UI switches. Dead zones on thresholds
// prevent bouncing when values hover near boundaries.
let currentMode_ble = 'Nominal';
let modeHoldStart_ble = Date.now();
const MIN_HOLD_MS_BLE = 3000;

function computeMode(r: Record<string, number>): string {
  // Key-on / Engine-off: ECU is powered but values are garbage.
  // Lock to Nominal — there's nothing to govern if the engine isn't running.
  if ((r.rpm || 0) < 100) {
    currentMode_ble = 'Nominal';
    modeHoldStart_ble = Date.now();
    return currentMode_ble;
  }

  let candidateMode: string;

  if (r.mil) {
    candidateMode = 'Lifecycle Warning';
  } else if ((r.engineLoad || 0) > 75) {
    candidateMode = 'Throughput Alert';
  } else if (currentMode_ble === 'Throughput Alert' && (r.engineLoad || 0) > 60) {
    candidateMode = 'Throughput Alert';
  } else if (Math.abs(r.stftB1 || 0) > 18) {
    candidateMode = 'Process Drift';
  } else if (currentMode_ble === 'Process Drift' && Math.abs(r.stftB1 || 0) > 12) {
    candidateMode = 'Process Drift';
  } else if ((r.speed || 0) < 3) {
    candidateMode = 'Nominal';
  } else if (currentMode_ble === 'Nominal' && (r.speed || 0) < 8) {
    candidateMode = 'Nominal';
  } else {
    candidateMode = 'Flow State';
  }

  // MIL always switches immediately (safety-critical)
  if (candidateMode === 'Lifecycle Warning') {
    currentMode_ble = candidateMode;
    modeHoldStart_ble = Date.now();
    return currentMode_ble;
  }

  // If candidate differs from current, only switch after sustained hold
  if (candidateMode !== currentMode_ble) {
    if (Date.now() - modeHoldStart_ble >= MIN_HOLD_MS_BLE) {
      currentMode_ble = candidateMode;
      modeHoldStart_ble = Date.now();
    }
  } else {
    modeHoldStart_ble = Date.now();
  }

  return currentMode_ble;
}

// ═══════════════════════════════════════════════════════════════
// Telemetry Loop
// ═══════════════════════════════════════════════════════════════

export function startBLENativeTelemetryLoop(
  onData: (snapshot: TelemetrySnapshot) => void,
  intervalMs: number = 300
): () => void {
  startTime = Date.now();
  const timer = setInterval(async () => {
    if (connectionState.isSimulated) {
      onData(simulatedTick());
      return;
    }

    if (txCharacteristic && connectionState.status === 'connected') {
      await pollAllBLEPIDs();
      onData(buildSnapshot());
    } else {
      // Strict fallback: never show mock data if not in demo mode
      const emptySnapshot: TelemetrySnapshot = {
        timestamp: Date.now(),
        tb1_maf: 0, tb2_fuelFlow: 0, tb3_map: 0, tb4_iat: 0, tb5_throttle: 0,
        tb6_rpm: 0, tb7_speed: 0, tb8_volEff: 0, tb9_afr: 14.7, tb10_baro: 101.3,
        pr1_timing: 0, pr2_stftB1: 0, pr3_ltftB1: 0, pr4_stftB2: 0, pr5_ltftB2: 0,
        pr6_combEff: 0, pr7_engLoad: 0, pr8_absLoad: 0,
        fs1_o2UpB1: 0, fs2_o2DnB1: 0, fs5_catTempB1: 0, fs7_catEff: 0, fs10_driverScore: 0,
        sl1_coolant: 0, sl3_battery: 12.0, sl4_runtime: 0, sl7_mil: false, sl8_dtcCount: 0,
        activeDTCs: [], sl11_degradation: 0,
        mpgInstant: 0, mpgRecovery: 0, governanceMode: 'Disconnected',
      };
      onData(emptySnapshot);
    }
  }, intervalMs);
  return () => clearInterval(timer);
}

// ═══════════════════════════════════════════════════════════════
// Cleanup & Utilities
// ═══════════════════════════════════════════════════════════════

function cleanup(): void {
  if (notificationSub) {
    notificationSub.remove();
    notificationSub = null;
  }
  connectedDevice = null;
  txCharacteristic = null;
  rxCharacteristic = null;
  responseBuffer = '';
  responseResolve = null;
  rawValues = {};
  supportedPIDs = new Set();
  pidSupportQueried = false;
}

export function disconnectBLENative(): void {
  if (connectedDevice) {
    connectedDevice.cancelConnection().catch(() => {});
  }
  cleanup();
  connectionState = { status: 'disconnected', deviceName: null, error: null, isSimulated: false, adapterInfo: null };
}

export function getBLENativeStatus(): BLEConnection {
  return { ...connectionState };
}

export function enterBLEDemoMode(onStatusChange: (status: BLEConnection) => void): void {
  connectionState = { status: 'connected', deviceName: 'SIMULATED', error: null, isSimulated: true, adapterInfo: 'Demo Mode — 2019 F-150 5.0L V8' };
  onStatusChange({ ...connectionState });
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
