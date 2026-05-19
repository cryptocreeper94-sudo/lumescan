/**
 * Lume-Auto — React Native BLE OBD-II Connector
 * Uses react-native-ble-plx for native Bluetooth Low Energy.
 */

import { BleManager, Device, Characteristic } from 'react-native-ble-plx';
import { TelemetrySnapshot, tick as simulatedTick } from './SimulatedEngine';
import { Platform, PermissionsAndroid } from 'react-native';

// Common BLE OBD-II service/characteristic UUIDs
const KNOWN_SERVICE_UUIDS = [
  '0000ffe0-0000-1000-8000-00805f9b34fb',
  '0000fff0-0000-1000-8000-00805f9b34fb',
  'e7810a71-73ae-499d-8c15-faa9aef0c3f2',
];

const KNOWN_CHAR_UUIDS = [
  '0000ffe1-0000-1000-8000-00805f9b34fb',
  '0000fff1-0000-1000-8000-00805f9b34fb',
  'bef8d6c9-9c21-4c9e-b632-bd58c1009f9f',
];

export type BLEStatus = 'disconnected' | 'scanning' | 'connecting' | 'initializing' | 'connected' | 'error';

export interface BLEConnection {
  status: BLEStatus;
  deviceName: string | null;
  error: string | null;
  isSimulated: boolean;
  adapterInfo: string | null;
}

const manager = new BleManager();
let connectedDevice: Device | null = null;
let txCharacteristic: Characteristic | null = null;
let responseBuffer = '';
let responseResolve: ((value: string) => void) | null = null;
let connectionState: BLEConnection = {
  status: 'disconnected', deviceName: null, error: null, isSimulated: false, adapterInfo: null,
};

let rawValues: Record<string, number> = {};
let startTime = Date.now();

// OBD-II PID definitions
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

/**
 * Request Android BLE permissions
 */
async function requestPermissions(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;

  try {
    const granted = await PermissionsAndroid.requestMultiple([
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
      PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
    ]);
    return Object.values(granted).every(v => v === PermissionsAndroid.RESULTS.GRANTED);
  } catch {
    return false;
  }
}

/**
 * Decode base64 BLE data to string
 */
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

/**
 * Encode string to base64 for BLE write
 */
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

/**
 * Send AT/OBD command via BLE
 */
async function sendBLECommand(cmd: string, timeoutMs: number = 3000): Promise<string> {
  if (!txCharacteristic || !connectedDevice) return '';

  return new Promise((resolve) => {
    responseResolve = resolve;
    responseBuffer = '';

    const data = encodeBase64(cmd + '\r');
    txCharacteristic!.writeWithResponse(data).catch(() => {
      resolve('');
    });

    setTimeout(() => {
      if (responseResolve) {
        responseResolve(responseBuffer || '');
        responseResolve = null;
      }
    }, timeoutMs);
  });
}

/**
 * Scan and connect to a BLE OBD-II adapter
 */
export async function connectBLENative(
  onStatusChange: (status: BLEConnection) => void
): Promise<boolean> {
  const permsOk = await requestPermissions();
  if (!permsOk) {
    connectionState = { status: 'error', deviceName: null, error: 'Bluetooth permissions denied', isSimulated: false, adapterInfo: null };
    onStatusChange({ ...connectionState });
    return false;
  }

  connectionState = { status: 'scanning', deviceName: null, error: null, isSimulated: false, adapterInfo: null };
  onStatusChange({ ...connectionState });

  return new Promise((resolve) => {
    let found = false;
    const timeout = setTimeout(() => {
      if (!found) {
        manager.stopDeviceScan();
        connectionState = { status: 'error', deviceName: null, error: 'No BLE adapter found. Make sure adapter is powered on.', isSimulated: false, adapterInfo: null };
        onStatusChange({ ...connectionState });
        resolve(false);
      }
    }, 10000);

    manager.startDeviceScan(KNOWN_SERVICE_UUIDS, null, async (error, device) => {
      if (error || !device || found) return;

      // Found a device with a known OBD-II service
      found = true;
      manager.stopDeviceScan();
      clearTimeout(timeout);

      const name = device.name || device.localName || 'OBD-II Adapter';
      connectionState = { status: 'connecting', deviceName: name, error: null, isSimulated: false, adapterInfo: null };
      onStatusChange({ ...connectionState });

      try {
        connectedDevice = await device.connect({ timeout: 5000 });
        await connectedDevice.discoverAllServicesAndCharacteristics();

        // Find the right characteristic
        for (const serviceUUID of KNOWN_SERVICE_UUIDS) {
          try {
            const chars = await connectedDevice.characteristicsForService(serviceUUID);
            for (const char of chars) {
              if ((char.isWritableWithResponse || char.isWritableWithoutResponse) && char.isNotifiable) {
                txCharacteristic = char;
                break;
              }
              if (KNOWN_CHAR_UUIDS.includes(char.uuid)) {
                txCharacteristic = char;
                break;
              }
            }
            if (txCharacteristic) break;
          } catch {
            continue;
          }
        }

        if (!txCharacteristic) {
          connectionState = { status: 'error', deviceName: name, error: 'No compatible characteristic found', isSimulated: false, adapterInfo: null };
          onStatusChange({ ...connectionState });
          resolve(false);
          return;
        }

        // Monitor notifications
        txCharacteristic.monitor((error, char) => {
          if (error || !char?.value) return;
          const chunk = decodeBase64(char.value);
          responseBuffer += chunk;
          if (responseBuffer.includes('>')) {
            const response = responseBuffer.replace(/>/g, '').trim();
            responseBuffer = '';
            if (responseResolve) {
              responseResolve(response);
              responseResolve = null;
            }
          }
        });

        // Initialize ELM327
        connectionState = { status: 'initializing', deviceName: name, error: null, isSimulated: false, adapterInfo: null };
        onStatusChange({ ...connectionState });

        await sendBLECommand('ATZ', 4000);
        await delay(1500);
        await sendBLECommand('ATE0');
        await sendBLECommand('ATL0');
        await sendBLECommand('ATS0');
        await sendBLECommand('ATH0');
        await sendBLECommand('ATSP0');
        const info = await sendBLECommand('ATI');

        connectionState = {
          status: 'connected', deviceName: name, error: null,
          isSimulated: false, adapterInfo: info || `BLE: ${name}`,
        };
        onStatusChange({ ...connectionState });
        startTime = Date.now();

        // Handle disconnect
        manager.onDeviceDisconnected(connectedDevice.id, () => {
          connectionState = { status: 'disconnected', deviceName: null, error: null, isSimulated: false, adapterInfo: null };
          onStatusChange({ ...connectionState });
          txCharacteristic = null;
          connectedDevice = null;
        });

        resolve(true);
      } catch (err: any) {
        connectionState = { status: 'error', deviceName: name, error: err?.message || 'Connection failed', isSimulated: false, adapterInfo: null };
        onStatusChange({ ...connectionState });
        resolve(false);
      }
    });
  });
}

async function readPID(cmd: string): Promise<string> {
  const response = await sendBLECommand(cmd, 2000);
  if (!response || response.includes('NO DATA') || response.includes('ERROR')) return '';
  const clean = response.replace(/[\s\r\n]/g, '');
  return clean.length >= 6 ? clean.substring(4) : '';
}

export async function pollAllBLEPIDs(): Promise<void> {
  if (!txCharacteristic) return;
  for (const { cmd, parse } of PIDS) {
    const hex = await readPID(cmd);
    if (hex && hex.length >= 2) {
      try { Object.assign(rawValues, parse(hex)); } catch {}
    }
  }
}

function buildSnapshot(): TelemetrySnapshot {
  const r = rawValues;
  const now = Date.now();
  return {
    timestamp: now,
    tb1_maf: r.maf || 0, tb2_fuelFlow: (r.maf || 0) * 22, tb3_map: r.map || 0,
    tb4_iat: r.iat || 25, tb5_throttle: r.throttle || 0, tb6_rpm: r.rpm || 0,
    tb7_speed: r.speed || 0, tb8_volEff: r.maf && r.rpm ? Math.min(100, (r.maf / (r.rpm * 0.005)) * 100) : 85,
    tb9_afr: 14.7 + (r.stftB1 || 0) * 0.05, tb10_baro: 101.3,
    pr1_timing: r.timing || 0, pr2_stftB1: r.stftB1 || 0, pr3_ltftB1: r.ltftB1 || 0,
    pr4_stftB2: 0, pr5_ltftB2: 0, pr6_combEff: 95 + (Math.abs(r.stftB1 || 0) < 5 ? 3 : 0),
    pr7_engLoad: r.engineLoad || 0, pr8_absLoad: (r.engineLoad || 0) * 0.85,
    fs1_o2UpB1: r.o2B1S1 || 0.45, fs2_o2DnB1: 0.72, fs5_catTempB1: 420, fs7_catEff: 93,
    fs10_driverScore: computeDriverScore(r),
    sl1_coolant: r.coolant || 0, sl3_battery: r.battery || 0,
    sl4_runtime: Math.floor((now - startTime) / 1000),
    sl7_mil: !!r.mil, sl8_dtcCount: r.dtcCount || 0, sl11_degradation: 88,
    mpgInstant: computeMPG(r), mpgRecovery: 0, governanceMode: computeMode(r),
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

export function disconnectBLENative(): void {
  if (connectedDevice) {
    connectedDevice.cancelConnection().catch(() => {});
  }
  connectedDevice = null;
  txCharacteristic = null;
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
