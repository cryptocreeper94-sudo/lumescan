/**
 * Lume-Auto — ELM327 Bluetooth OBD-II Protocol Handler
 * Connects to real ELM327 adapters via BLE and reads live PIDs.
 * Falls back to simulated engine if no adapter found.
 */

import { BleManager, Device, Characteristic } from 'react-native-ble-plx';
import { TelemetrySnapshot, tick as simulatedTick } from './SimulatedEngine';

// Extend globalThis for session tracking
declare global {
  var __lumeStartTime: number | undefined;
}

// Common ELM327 BLE service/characteristic UUIDs
const ELM327_SERVICE_UUID = 'fff0';
const ELM327_WRITE_UUID = 'fff1';
const ELM327_READ_UUID = 'fff2';

// Alternative UUIDs for different adapter brands
const ALT_SERVICE_UUIDS = [
  'fff0', '18f0', '0000fff0-0000-1000-8000-00805f9b34fb',
  'e7810a71-73ae-499d-8c15-faa9aef0c3f2', // BAFX
];

// OBD-II PIDs we read
const PID_COMMANDS: { pid: string; parse: (bytes: number[]) => Record<string, number> }[] = [
  { pid: '010C', parse: (b) => ({ rpm: ((b[0] * 256) + b[1]) / 4 }) },                    // RPM
  { pid: '010D', parse: (b) => ({ speed: b[0] }) },                                          // Vehicle Speed (km/h)
  { pid: '0110', parse: (b) => ({ maf: ((b[0] * 256) + b[1]) / 100 }) },                   // MAF Air Flow
  { pid: '0111', parse: (b) => ({ throttle: b[0] * 100 / 255 }) },                          // Throttle Position
  { pid: '0104', parse: (b) => ({ engineLoad: b[0] * 100 / 255 }) },                        // Engine Load
  { pid: '0105', parse: (b) => ({ coolant: b[0] - 40 }) },                                   // Coolant Temp
  { pid: '010F', parse: (b) => ({ iat: b[0] - 40 }) },                                       // Intake Air Temp
  { pid: '010B', parse: (b) => ({ map: b[0] }) },                                            // MAP
  { pid: '010E', parse: (b) => ({ timing: (b[0] / 2) - 64 }) },                             // Timing Advance
  { pid: '0106', parse: (b) => ({ stftB1: (b[0] - 128) * 100 / 128 }) },                   // STFT Bank 1
  { pid: '0107', parse: (b) => ({ ltftB1: (b[0] - 128) * 100 / 128 }) },                   // LTFT Bank 1
  { pid: '0114', parse: (b) => ({ o2B1S1: b[0] / 200 }) },                                  // O2 Bank 1 Sensor 1
  { pid: '0142', parse: (b) => ({ battery: ((b[0] * 256) + b[1]) / 1000 }) },              // Battery Voltage
  { pid: '011C', parse: (b) => ({ obdStandard: b[0] }) },                                    // OBD Standard
  { pid: '0101', parse: (b) => ({ mil: (b[0] & 0x80) ? 1 : 0, dtcCount: b[0] & 0x7F }) },       // MIL + DTC count
];

export type ConnectionStatus = 'disconnected' | 'scanning' | 'connecting' | 'initializing' | 'connected' | 'error';

export interface OBDConnection {
  status: ConnectionStatus;
  deviceName: string | null;
  error: string | null;
  isSimulated: boolean;
}

let manager: BleManager | null = null;
let connectedDevice: Device | null = null;
let writeChar: Characteristic | null = null;
let readChar: Characteristic | null = null;
let connectionStatus: OBDConnection = {
  status: 'disconnected',
  deviceName: null,
  error: null,
  isSimulated: false,
};

// Raw PID values from adapter
let rawValues: Record<string, number> = {};
let lastTickTime = Date.now();

function getManager(): BleManager {
  if (!manager) {
    manager = new BleManager();
  }
  return manager;
}

/**
 * Scan for ELM327 devices via BLE
 */
export async function scanForDevices(
  onStatusChange: (status: OBDConnection) => void,
  timeoutMs: number = 10000
): Promise<Device | null> {
  const mgr = getManager();

  connectionStatus = { status: 'scanning', deviceName: null, error: null, isSimulated: false };
  onStatusChange({ ...connectionStatus });

  return new Promise((resolve) => {
    let found = false;
    const timeout = setTimeout(() => {
      if (!found) {
        mgr.stopDeviceScan();
        resolve(null);
      }
    }, timeoutMs);

    mgr.startDeviceScan(null, { allowDuplicates: false }, (error, device) => {
      if (error) {
        console.log('[Lume-Auto] Scan error:', error.message);
        return;
      }

      if (!device || !device.name) return;

      const name = device.name.toLowerCase();
      const isELM = name.includes('elm') || name.includes('obd') || name.includes('vlink') ||
                     name.includes('bafx') || name.includes('carista') || name.includes('obdlink') ||
                     name.includes('veepeak') || name.includes('konnwei') || name.includes('autophix');

      if (isELM) {
        found = true;
        clearTimeout(timeout);
        mgr.stopDeviceScan();
        console.log(`[Lume-Auto] Found ELM327 device: ${device.name}`);
        resolve(device);
      }
    });
  });
}

/**
 * Connect to an ELM327 device and initialize
 */
export async function connectToDevice(
  device: Device,
  onStatusChange: (status: OBDConnection) => void
): Promise<boolean> {
  try {
    connectionStatus = { status: 'connecting', deviceName: device.name, error: null, isSimulated: false };
    onStatusChange({ ...connectionStatus });

    const connected = await device.connect({ timeout: 5000 });
    await connected.discoverAllServicesAndCharacteristics();

    connectedDevice = connected;

    // Find the right service and characteristics
    const services = await connected.services();
    for (const service of services) {
      const chars = await connected.characteristicsForService(service.uuid);
      for (const char of chars) {
        if (char.isWritableWithResponse || char.isWritableWithoutResponse) {
          writeChar = char;
        }
        if (char.isNotifiable || char.isReadable) {
          readChar = char;
        }
      }
      if (writeChar && readChar) break;
    }

    if (!writeChar || !readChar) {
      throw new Error('Could not find ELM327 characteristics');
    }

    connectionStatus = { status: 'initializing', deviceName: device.name, error: null, isSimulated: false };
    onStatusChange({ ...connectionStatus });

    // Initialize ELM327
    await sendCommand('ATZ');    // Reset
    await delay(1000);
    await sendCommand('ATE0');   // Echo off
    await sendCommand('ATL0');   // Linefeeds off
    await sendCommand('ATS0');   // Spaces off
    await sendCommand('ATH0');   // Headers off
    await sendCommand('ATSP0');  // Auto-detect protocol

    connectionStatus = { status: 'connected', deviceName: device.name, error: null, isSimulated: false };
    onStatusChange({ ...connectionStatus });
    return true;

  } catch (err: any) {
    connectionStatus = { status: 'error', deviceName: device.name, error: err.message, isSimulated: false };
    onStatusChange({ ...connectionStatus });
    return false;
  }
}

async function sendCommand(cmd: string): Promise<string> {
  if (!writeChar || !connectedDevice) return '';

  try {
    const encoded = btoa(cmd + '\r');
    await writeChar.writeWithResponse(encoded);
    await delay(200);

    if (readChar && readChar.isReadable) {
      const result = await readChar.read();
      if (result?.value) {
        return atob(result.value).replace(/[\r\n>]/g, '').trim();
      }
    }
  } catch (err) {
    console.log(`[Lume-Auto] Command error (${cmd}):`, err);
  }
  return '';
}

function parseOBDResponse(response: string): number[] {
  // Remove header bytes (41 XX) and parse remaining hex
  const clean = response.replace(/\s/g, '');
  if (clean.length < 6) return [];
  const dataHex = clean.substring(4); // skip "41XX"
  const bytes: number[] = [];
  for (let i = 0; i < dataHex.length; i += 2) {
    bytes.push(parseInt(dataHex.substring(i, i + 2), 16));
  }
  return bytes;
}

/**
 * Read all PIDs once — called in the polling loop
 */
export async function readAllPIDs(): Promise<void> {
  for (const { pid, parse } of PID_COMMANDS) {
    try {
      const response = await sendCommand(pid);
      if (response && !response.includes('NO DATA') && !response.includes('ERROR')) {
        const bytes = parseOBDResponse(response);
        if (bytes.length > 0) {
          const values = parse(bytes);
          Object.assign(rawValues, values);
        }
      }
    } catch {
      // Skip failed PIDs silently
    }
  }
}

/**
 * Build a TelemetrySnapshot from real OBD data
 */
export function buildRealSnapshot(): TelemetrySnapshot {
  const r = rawValues;
  const now = Date.now();
  const dt = (now - lastTickTime) / 1000;
  lastTickTime = now;

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
    pr6_combEff: 95 + ((r.stftB1 || 0) > -5 && (r.stftB1 || 0) < 5 ? 3 : 0),
    pr7_engLoad: r.engineLoad || 0,
    pr8_absLoad: (r.engineLoad || 0) * 0.85,
    fs1_o2UpB1: r.o2B1S1 || 0.45,
    fs2_o2DnB1: 0.72,
    fs5_catTempB1: 420,
    fs7_catEff: 93,
    fs10_driverScore: computeDriverScore(r),
    sl1_coolant: r.coolant || 0,
    sl3_battery: r.battery || 0,
    sl4_runtime: Math.floor((now - (globalThis.__lumeStartTime || now)) / 1000),
    sl7_mil: !!r.mil,
    sl8_dtcCount: r.dtcCount || 0,
    activeDTCs: [],
    sl11_degradation: 88,
    mpgInstant: computeMPG(r),
    mpgRecovery: 0, // calculated over time
    governanceMode: computeMode(r),
  };
}

function computeDriverScore(r: Record<string, number>): number {
  let score = 80;
  if ((r.throttle || 0) > 70) score -= 15;
  if ((r.throttle || 0) < 30) score += 10;
  if ((r.speed || 0) > 0 && (r.speed || 0) < 100) score += 5;
  return Math.min(100, Math.max(0, score));
}

function computeMPG(r: Record<string, number>): number {
  if (!r.speed || r.speed < 5 || !r.maf || r.maf < 1) return 0;
  const speedMph = r.speed * 0.621371;
  const fuelFlowGph = r.maf * 0.0805 / 14.7 * 6.17;
  if (fuelFlowGph < 0.01) return 0;
  return Math.min(50, Math.max(0, speedMph / fuelFlowGph));
}

// ── Governance Mode with Hysteresis ──
let currentMode_obd = 'Nominal';
let modeHoldStart_obd = Date.now();
const MIN_HOLD_MS_OBD = 3000;

function computeMode(r: Record<string, number>): string {
  if ((r.rpm || 0) < 100) {
    currentMode_obd = 'Nominal';
    modeHoldStart_obd = Date.now();
    return currentMode_obd;
  }

  let candidateMode: string;

  if (r.mil) {
    candidateMode = 'Lifecycle Warning';
  } else if ((r.engineLoad || 0) > 75) {
    candidateMode = 'Throughput Alert';
  } else if (currentMode_obd === 'Throughput Alert' && (r.engineLoad || 0) > 60) {
    candidateMode = 'Throughput Alert';
  } else if (Math.abs(r.stftB1 || 0) > 18) {
    candidateMode = 'Process Drift';
  } else if (currentMode_obd === 'Process Drift' && Math.abs(r.stftB1 || 0) > 12) {
    candidateMode = 'Process Drift';
  } else if ((r.speed || 0) < 3) {
    candidateMode = 'Nominal';
  } else if (currentMode_obd === 'Nominal' && (r.speed || 0) < 8) {
    candidateMode = 'Nominal';
  } else {
    candidateMode = 'Flow State';
  }

  if (candidateMode === 'Lifecycle Warning') {
    currentMode_obd = candidateMode;
    modeHoldStart_obd = Date.now();
    return currentMode_obd;
  }

  if (candidateMode !== currentMode_obd) {
    if (Date.now() - modeHoldStart_obd >= MIN_HOLD_MS_OBD) {
      currentMode_obd = candidateMode;
      modeHoldStart_obd = Date.now();
    }
  } else {
    modeHoldStart_obd = Date.now();
  }

  return currentMode_obd;
}

/**
 * Start the telemetry polling loop.
 * If connected to real adapter, polls PIDs.
 * If not, returns simulated data.
 */
export function startTelemetryLoop(
  onData: (snapshot: TelemetrySnapshot) => void,
  intervalMs: number = 250
): () => void {
  globalThis.__lumeStartTime = Date.now();

  const timer = setInterval(async () => {
    if (connectedDevice && connectionStatus.status === 'connected') {
      await readAllPIDs();
      onData(buildRealSnapshot());
    } else {
      onData(simulatedTick());
    }
  }, intervalMs);

  return () => clearInterval(timer);
}

export function isRealConnection(): boolean {
  return connectionStatus.status === 'connected' && connectedDevice !== null;
}

export function getConnectionStatus(): OBDConnection {
  return { ...connectionStatus };
}

export function disconnect(): void {
  if (connectedDevice) {
    connectedDevice.cancelConnection().catch(() => {});
    connectedDevice = null;
  }
  writeChar = null;
  readChar = null;
  connectionStatus = { status: 'disconnected', deviceName: null, error: null, isSimulated: false };
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
