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

const PIDS: { cmd: string; parse: (hex: string) => Record<string, number> }[] = [
  { cmd: '010C', parse: (h) => ({ rpm: (parseInt(h.slice(0, 2), 16) * 256 + parseInt(h.slice(2, 4), 16)) / 4 }) },
  { cmd: '010D', parse: (h) => ({ speed: parseInt(h.slice(0, 2), 16) }) },
  { cmd: '0110', parse: (h) => ({ maf: (parseInt(h.slice(0, 2), 16) * 256 + parseInt(h.slice(2, 4), 16)) / 100 }) },
  { cmd: '0111', parse: (h) => ({ throttle: parseInt(h.slice(0, 2), 16) * 100 / 255 }) },
  { cmd: '0104', parse: (h) => ({ engineLoad: parseInt(h.slice(0, 2), 16) * 100 / 255 }) },
  { cmd: '0105', parse: (h) => ({ coolant: parseInt(h.slice(0, 2), 16) - 40 }) },
  { cmd: '010F', parse: (h) => ({ iat: parseInt(h.slice(0, 2), 16) - 40 }) },
  { cmd: '010B', parse: (h) => ({ map: parseInt(h.slice(0, 2), 16) }) },
  { cmd: '010E', parse: (h) => ({ timing: parseInt(h.slice(0, 2), 16) / 2 - 64 }) },
  { cmd: '0106', parse: (h) => ({ stftB1: (parseInt(h.slice(0, 2), 16) - 128) * 100 / 128 }) },
  { cmd: '0107', parse: (h) => ({ ltftB1: (parseInt(h.slice(0, 2), 16) - 128) * 100 / 128 }) },
  { cmd: '0114', parse: (h) => ({ o2B1S1: parseInt(h.slice(0, 2), 16) / 200 }) },
  { cmd: '0142', parse: (h) => ({ battery: (parseInt(h.slice(0, 2), 16) * 256 + parseInt(h.slice(2, 4), 16)) / 1000 }) },
  { cmd: '0101', parse: (h) => ({ mil: (parseInt(h.slice(0, 2), 16) & 0x80) ? 1 : 0, dtcCount: parseInt(h.slice(0, 2), 16) & 0x7F }) },
];

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
 * Read active DTCs via Mode 03
 */
export async function readDTCs(): Promise<string[]> {
  const response = await sendBLECommand('03', 5000);
  if (!response || response.includes('NO DATA')) return [];
  
  const dtcs: string[] = [];
  const clean = response.replace(/[\s\r\n]/g, '');
  
  // Response format: "43XXYY..." — skip "43" header, then pairs of bytes = DTCs
  // Find the "43" header
  const idx = clean.indexOf('43');
  if (idx < 0) return [];
  
  const data = clean.substring(idx + 2);
  for (let i = 0; i + 3 < data.length; i += 4) {
    const byte1 = parseInt(data.slice(i, i + 2), 16);
    const byte2 = parseInt(data.slice(i + 2, i + 4), 16);
    if (byte1 === 0 && byte2 === 0) continue; // Padding
    
    // Decode DTC: first 2 bits = category, remaining 14 bits = code
    const category = ['P', 'C', 'B', 'U'][(byte1 >> 6) & 0x03];
    const digit2 = (byte1 >> 4) & 0x03;
    const digit3 = byte1 & 0x0F;
    const digit4 = (byte2 >> 4) & 0x0F;
    const digit5 = byte2 & 0x0F;
    dtcs.push(`${category}${digit2}${digit3.toString(16)}${digit4.toString(16)}${digit5.toString(16)}`.toUpperCase());
  }
  
  return dtcs;
}

export async function pollAllBLEPIDs(): Promise<void> {
  if (!txCharacteristic || connectionState.status !== 'connected' || connectionState.isSimulated) return;
  
  for (const { cmd, parse } of PIDS) {
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
  return {
    timestamp: now,
    tb1_maf: r.maf || 0,
    tb2_fuelFlow: (r.maf || 0) * 22,
    tb3_map: r.map || 0,
    tb4_iat: r.iat || 25,
    tb5_throttle: r.throttle || 0,
    tb6_rpm: r.rpm || 0,
    tb7_speed: r.speed || 0,
    tb8_volEff: r.maf && r.rpm ? Math.min(100, (r.maf / (r.rpm * 0.005)) * 100) : 85,
    tb9_afr: 14.7 + (r.stftB1 || 0) * 0.05,
    tb10_baro: 101.3,
    pr1_timing: r.timing || 0,
    pr2_stftB1: r.stftB1 || 0,
    pr3_ltftB1: r.ltftB1 || 0,
    pr4_stftB2: 0,
    pr5_ltftB2: 0,
    pr6_combEff: 95 + (Math.abs(r.stftB1 || 0) < 5 ? 3 : 0),
    pr7_engLoad: r.engineLoad || 0,
    pr8_absLoad: (r.engineLoad || 0) * 0.85,
    fs1_o2UpB1: r.o2B1S1 || 0.45,
    fs2_o2DnB1: 0.72,
    fs5_catTempB1: 420,
    fs7_catEff: 93,
    fs10_driverScore: computeDriverScore(r),
    sl1_coolant: r.coolant || 0,
    sl3_battery: r.battery || 0,
    sl4_runtime: Math.floor((now - startTime) / 1000),
    sl7_mil: !!r.mil,
    sl8_dtcCount: r.dtcCount || 0,
    activeDTCs: (r as any).activeDTCs || [],
    sl11_degradation: 88,
    mpgInstant: computeMPG(r),
    mpgRecovery: 0,
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

function computeMode(r: Record<string, number>): string {
  if (r.mil) return 'Lifecycle Warning';
  if ((r.engineLoad || 0) > 70) return 'Throughput Alert';
  if (Math.abs(r.stftB1 || 0) > 15) return 'Process Drift';
  if ((r.speed || 0) < 5) return 'Nominal';
  return 'Flow State';
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
    if (txCharacteristic && connectionState.status === 'connected' && !connectionState.isSimulated) {
      await pollAllBLEPIDs();
      onData(buildSnapshot());
    } else {
      onData(simulatedTick());
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
