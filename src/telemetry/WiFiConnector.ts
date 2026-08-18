/**
 * Lume-Auto — WiFi OBD-II Protocol Handler
 * Connects to WiFi ELM327 adapters via TCP socket.
 * Works in Expo Go — no native modules required.
 * 
 * WiFi ELM327 adapters create a hotspot (typically "OBDLink" or "WiFi_OBDII").
 * Phone connects to the hotspot, then communicates via TCP on port 35000.
 * Same AT command protocol as Bluetooth — just a different transport.
 */

import { TelemetrySnapshot, tick as simulatedTick } from './SimulatedEngine';
import TcpSocket from 'react-native-tcp-socket';
import { logEvent } from './FlightRecorder';

// Default WiFi ELM327 connection parameters
const DEFAULT_HOST = '192.168.0.10';  // Most common
const ALT_HOSTS = ['192.168.0.10', '192.168.1.10', '10.0.0.1', '192.168.4.1'];
const DEFAULT_PORT = 35000;

export type WiFiStatus = 'disconnected' | 'probing' | 'connecting' | 'initializing' | 'connected' | 'error';

export interface WiFiConnection {
  status: WiFiStatus;
  host: string | null;
  error: string | null;
  isSimulated: boolean;
  adapterInfo: string | null;
}

let socket: any = null;
let responseBuffer = '';
let connectionState: WiFiConnection = {
  status: 'disconnected', host: null, error: null, isSimulated: false, adapterInfo: null,
};

// Raw PID values from adapter
let rawValues: Record<string, number> = {};
let startTime = Date.now();

// ── Signal Smoothing ──
// EMA (exponential moving average) prevents jitter on noisy OBD signals
let smoothedRPM = 0;
let smoothedSpeed = 0;
const EMA_ALPHA = 0.3; // Lower = smoother but more lag

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
  { cmd: '0133', parse: (h) => ({ baro: parseInt(h.slice(0, 2), 16) }), optional: true },
  // ── Process Rate (PR) ──
  { cmd: '010E', parse: (h) => ({ timing: parseInt(h.slice(0, 2), 16) / 2 - 64 }) },
  { cmd: '0106', parse: (h) => ({ stftB1: (parseInt(h.slice(0, 2), 16) - 128) * 100 / 128 }) },
  { cmd: '0107', parse: (h) => ({ ltftB1: (parseInt(h.slice(0, 2), 16) - 128) * 100 / 128 }) },
  { cmd: '0108', parse: (h) => ({ stftB2: (parseInt(h.slice(0, 2), 16) - 128) * 100 / 128 }), optional: true },
  { cmd: '0109', parse: (h) => ({ ltftB2: (parseInt(h.slice(0, 2), 16) - 128) * 100 / 128 }), optional: true },
  { cmd: '0143', parse: (h) => ({ absLoad: (parseInt(h.slice(0, 2), 16) * 256 + parseInt(h.slice(2, 4), 16)) * 100 / 255 }), optional: true },
  // ── Flow State (FS) ──
  { cmd: '0114', parse: (h) => ({ o2B1S1: parseInt(h.slice(0, 2), 16) / 200 }) },
  { cmd: '0115', parse: (h) => ({ o2B1S2: parseInt(h.slice(0, 2), 16) / 200 }), optional: true },
  { cmd: '013C', parse: (h) => ({ catTempB1: (parseInt(h.slice(0, 2), 16) * 256 + parseInt(h.slice(2, 4), 16)) / 10 - 40 }), optional: true },
  // ── System Lifecycle (SL) ──
  { cmd: '0142', parse: (h) => ({ battery: (parseInt(h.slice(0, 2), 16) * 256 + parseInt(h.slice(2, 4), 16)) / 1000 }) },
  { cmd: '0101', parse: (h) => ({ mil: (parseInt(h.slice(0, 2), 16) & 0x80) ? 1 : 0, dtcCount: parseInt(h.slice(0, 2), 16) & 0x7F }) },
  { cmd: '011F', parse: (h) => ({ runtimeSinceStart: parseInt(h.slice(0, 2), 16) * 256 + parseInt(h.slice(2, 4), 16) }), optional: true },
  { cmd: '0146', parse: (h) => ({ ambientTemp: parseInt(h.slice(0, 2), 16) - 40 }), optional: true },
];

/**
 * TCP socket approach using React Native's raw TCP via react-native-tcp-socket
 * This is the primary connection method for WiFi ELM327
 */
class ELM327Socket {
  private socket: any = null;
  private responseResolve: ((value: string) => void) | null = null;
  private buffer = '';
  // Command serialization: exactly ONE command in flight at a time.
  // Overlapping telemetry sweeps used to overwrite responseResolve and
  // attribute responses to the wrong PID (root cause of wrong/blank data).
  private commandChain: Promise<unknown> = Promise.resolve();
  // Set on timeout: the adapter may still send a late response, which the
  // next command drains and discards before transmitting.
  private needsDrain = false;

  async connect(host: string, port: number): Promise<boolean> {
    return new Promise((resolve) => {
      try {
        this.socket = TcpSocket.createConnection({
          host: host,
          port: port,
        }, () => {
          console.log('[LumeScan WiFi] TCP connected to ' + host + ':' + port);
          logEvent('WiFi', 'INFO', `TCP connected to ${host}:${port}`);
          resolve(true);
        });
        this.socket.setTimeout(5000);
        this.socket.on('timeout', () => {
          console.warn('[LumeScan WiFi] TCP connection timed out');
          logEvent('WiFi', 'ERROR', 'TCP connection timed out');
          if (this.socket) {
            this.socket.destroy();
            this.socket = null;
          }
          resolve(false);
        });
        
        this.socket.on('data', (data: Buffer | string) => {
          // Convert Buffer to string if necessary
          const text = typeof data === 'string' ? data : data.toString('utf8');
          logEvent('WiFi', 'RX', text.trim() || '<empty buffer>');
          this.buffer += text;
          if (this.buffer.includes('>')) {
            const response = this.buffer.replace(/>/g, '').trim();
            this.buffer = '';
            if (this.responseResolve) {
              this.responseResolve(response);
              this.responseResolve = null;
            }
          }
        });
        
        this.socket.on('error', (error: any) => {
          console.warn('[LumeScan WiFi] TCP Error: ', error);
          logEvent('WiFi', 'ERROR', `TCP Error: ${error?.message || error}`);
          if (this.socket) {
            this.socket.destroy();
            this.socket = null;
          }
          resolve(false);
        });
        
        this.socket.on('close', () => {
          console.log('[LumeScan WiFi] TCP disconnected');
          logEvent('WiFi', 'INFO', 'TCP disconnected');
        });

      } catch {
        resolve(false);
      }
    });
  }

  async send(cmd: string, timeoutMs: number = 2000): Promise<string> {
    const run = this.commandChain.then(() => this.execute(cmd, timeoutMs));
    // Keep the chain alive even if a command fails
    this.commandChain = run.catch(() => {});
    return run;
  }

  private async execute(cmd: string, timeoutMs: number): Promise<string> {
    if (!this.socket) return '';
    // Strip any trailing CR from the caller — we append exactly one below.
    // "CMD\r\r" makes the ELM327 REPEAT the previous command (bare CR is the
    // ELM327 'repeat' shortcut), producing phantom duplicate responses.
    cmd = cmd.replace(/[\r\n]+$/, '');

    // Drain window: if the previous command timed out, give its late
    // response a moment to arrive, then throw it away.
    if (this.needsDrain) {
      this.needsDrain = false;
      await delay(300);
      this.buffer = '';
    }
    if (!this.socket) return '';

    return new Promise((resolve) => {
      let settled = false;
      let timer: ReturnType<typeof setTimeout> | null = null;

      const finish = (value: string, timedOut: boolean = false) => {
        if (settled) return;
        settled = true;
        this.responseResolve = null;
        this.buffer = '';
        if (timedOut) this.needsDrain = true;
        if (timer) clearTimeout(timer);
        resolve(value);
      };

      this.buffer = '';
      this.responseResolve = finish;
      logEvent('WiFi', 'TX', cmd);
      try {
        this.socket.write(cmd + '\r');
      } catch (err: any) {
        logEvent('WiFi', 'ERROR', `Write failed for ${cmd}: ${err?.message || err}`);
        finish('');
        return;
      }
      timer = setTimeout(() => {
        logEvent('WiFi', 'ERROR', `Timeout after ${timeoutMs}ms waiting for response to ${cmd}`);
        finish((this.buffer || '').replace(/[\r\n>]/g, ' ').trim(), true);
      }, timeoutMs);
    });
  }

  close() {
    if (this.socket) {
      this.socket.destroy();
      this.socket = null;
    }
    this.buffer = '';
    this.responseResolve = null;
    this.commandChain = Promise.resolve(); // Invalidate queued commands
    this.needsDrain = false;
  }

  get isConnected(): boolean {
    return this.socket !== null;
  }
}

let elmSocket = new ELM327Socket();

/**
 * Probe network for ELM327 WiFi adapter
 */
export async function probeForAdapter(
  onStatusChange: (status: WiFiConnection) => void,
  customHost?: string
): Promise<boolean> {
  connectionState = { status: 'probing', host: null, error: null, isSimulated: false, adapterInfo: null };
  onStatusChange({ ...connectionState });

  const hostsToTry = customHost ? [customHost] : ALT_HOSTS;

  for (const host of hostsToTry) {
    console.log(`[Lume-Auto] Probing ${host}:${DEFAULT_PORT}...`);
    
    connectionState = { status: 'connecting', host, error: null, isSimulated: false, adapterInfo: null };
    onStatusChange({ ...connectionState });

    const connected = await elmSocket.connect(host, DEFAULT_PORT);
    if (connected) {
      connectionState = { status: 'initializing', host, error: null, isSimulated: false, adapterInfo: null };
      onStatusChange({ ...connectionState });

      // Reset adapter — should reply with a version string (e.g. "ELM327 v1.5")
      let resetResp = await elmSocket.send('ATZ', 6000);
      await delay(1500);
      if (!resetResp || !/ELM|OBD|STN|V[0-9]/i.test(resetResp)) {
        logEvent('WiFi', 'ERROR', `ATZ returned unexpected response: "${resetResp}"`);
        // Some adapters swallow the ATZ banner — try once more before judging
        const retryReset = await elmSocket.send('ATZ', 6000);
        await delay(1500);
        if (!retryReset && !resetResp) {
          logEvent('WiFi', 'ERROR', 'Adapter TCP port open but serial channel silent — trying next host');
          elmSocket.close();
          continue;
        }
      }

      // Configure for OBD-II — verify each response (ELM327 replies "OK")
      for (const c of ['ATE0', 'ATL0', 'ATS0', 'ATH0']) {
        const r = await elmSocket.send(c, 2000);
        if (!r.toUpperCase().includes('OK')) {
          logEvent('WiFi', 'ERROR', `${c} did not return OK: "${r}"`);
        }
        await delay(100);
      }
      await elmSocket.send('ATSP0', 2000);   // Auto-detect vehicle protocol
      await delay(100);
      const info = await elmSocket.send('ATI');        // Get adapter info

      // Test connectivity — a REAL RPM reading ("41 0C ...") is the only
      // proof the adapter can talk to the vehicle.
      const isLiveData = (resp: string) =>
        resp.replace(/[\s\r\n]/g, '').toUpperCase().includes('410C');

      let testResponse = await elmSocket.send('010C', 5000);
      let protocolOk = isLiveData(testResponse);
      if (!protocolOk) {
        for (const p of ['ATSP6' /* CAN 11-bit 500k */, 'ATSP8' /* CAN 11-bit 250k */]) {
          logEvent('WiFi', 'INFO', `Retrying with ${p}...`);
          await elmSocket.send(p, 2000);
          await delay(500);
          testResponse = await elmSocket.send('010C', 5000);
          if (isLiveData(testResponse)) { protocolOk = true; break; }
        }
      }

      let vehicleWarning: string | null = null;
      if (!protocolOk) {
        const raw = testResponse.trim() || '(no response)';
        logEvent('WiFi', 'ERROR', `Vehicle test failed. Last 010C response: "${raw}"`);
        if (/NO ?DATA/i.test(testResponse)) {
          // Adapter reached the bus but the vehicle isn't answering (common
          // with ignition off). Connect in a degraded state with a clear message.
          vehicleWarning = 'Adapter connected, but the vehicle is not responding yet. Turn the ignition ON (engine running is best).';
        } else {
          elmSocket.close();
          connectionState = {
            status: 'error', host: null, isSimulated: false, adapterInfo: null,
            error: `The adapter never returned vehicle data (last response: ${raw}). It may not be fully plugged into the OBD port.`,
          };
          onStatusChange({ ...connectionState });
          return false;
        }
      }

      connectionState = {
        status: 'connected',
        host,
        error: vehicleWarning,
        isSimulated: false,
        adapterInfo: (info || 'ELM327 WiFi') + (vehicleWarning ? ' — waiting for vehicle' : ''),
      };
      onStatusChange({ ...connectionState });
      startTime = Date.now();
      rawValues = {};
      return true;
    }
  }

  connectionState = { status: 'error', host: null, error: 'No WiFi adapter found', isSimulated: false, adapterInfo: null };
  onStatusChange({ ...connectionState });
  return false;
}

/**
 * Read a single PID
 */
async function readPID(cmd: string): Promise<string> {
  const response = await elmSocket.send(cmd, 1500);
  if (!response || response.includes('NO DATA') || response.includes('ERROR') || response.includes('UNABLE')) {
    return '';
  }
  // Strip whitespace and any "SEARCHING..." preamble, then anchor on the
  // "41XX" response header — the ONLY reliable marker. Blindly skipping
  // 4 chars decodes command echo or stray frames as vehicle data.
  const clean = response.replace(/SEARCHING\.*/gi, '').replace(/[\s\r\n]/g, '');
  const modeResponse = '41' + cmd.slice(2, 4).toUpperCase();
  const idx = clean.toUpperCase().indexOf(modeResponse);
  if (idx >= 0) {
    return clean.substring(idx + 4); // Skip "41XX"
  }
  logEvent('WiFi', 'ERROR', `Unparseable response to ${cmd}: "${response.trim()}"`);
  return '';
}

/**
 * Poll all PIDs once
 */
export async function pollAllPIDs(): Promise<void> {
  if (!elmSocket.isConnected) return;

  for (const { cmd, parse } of PIDS) {
    const hex = await readPID(cmd);
    if (hex && hex.length >= 2) {
      try {
        const values = parse(hex);
        Object.assign(rawValues, values);
      } catch {
        // Skip malformed responses
      }
    }
  }
}

/**
 * Build TelemetrySnapshot from real WiFi adapter data
 */
export function buildSnapshot(): TelemetrySnapshot {
  const r = rawValues;
  const now = Date.now();
  const runtimeSeconds = r.runtimeSinceStart || Math.floor((now - startTime) / 1000);

  const afr = r.maf && r.engineLoad
    ? 14.7 + (r.stftB1 || 0) * 0.05 + (r.ltftB1 || 0) * 0.02
    : 14.7;
  const upstreamO2 = r.o2B1S1 || 0.45;
  const downstreamO2 = r.o2B1S2 ?? 0.72;
  const catEff = r.o2B1S2 !== undefined
    ? Math.min(99, Math.max(60, 100 - Math.abs(downstreamO2 - 0.72) * 80))
    : (upstreamO2 > 0.3 && upstreamO2 < 0.7 ? 94 : 91);
  const fuelTrimMagnitude = Math.abs(r.stftB1 || 0) + Math.abs(r.ltftB1 || 0);
  const combEff = Math.min(99.5, Math.max(85, 98 - fuelTrimMagnitude * 0.3));
  let degradation = 100;
  if (r.mil) degradation -= 15;
  if ((r.dtcCount || 0) > 0) degradation -= (r.dtcCount || 0) * 5;
  if (fuelTrimMagnitude > 10) degradation -= 8;
  if ((r.coolant || 90) > 105) degradation -= 10;
  if ((r.battery || 14) < 12.5) degradation -= 10;
  if (catEff < 90) degradation -= 8;
  degradation = Math.min(100, Math.max(0, degradation));
  const baselineMPG = computeMPG(r);
  const mpgRecovery = baselineMPG > 0 && fuelTrimMagnitude < 8
    ? Math.min(18, 5 + (98 - fuelTrimMagnitude) * 0.12)
    : 0;

  return {
    timestamp: now,
    tb1_maf: r.maf || 0,
    tb2_fuelFlow: (r.maf || 0) * 22,
    tb3_map: r.map || 0,
    tb4_iat: r.iat || 25,
    tb5_throttle: r.throttle || 0,
    tb6_rpm: smoothRPM(r.rpm || 0),
    tb7_speed: smoothSpeed(r.speed || 0),
    tb8_volEff: r.maf && r.rpm ? Math.min(100, (r.maf / (r.rpm * 0.005)) * 100) : 85,
    tb9_afr: afr,
    tb10_baro: r.baro || 101.3,
    pr1_timing: r.timing || 0,
    pr2_stftB1: r.stftB1 || 0,
    pr3_ltftB1: r.ltftB1 || 0,
    pr4_stftB2: r.stftB2 || 0,
    pr5_ltftB2: r.ltftB2 || 0,
    pr6_combEff: combEff,
    pr7_engLoad: r.engineLoad || 0,
    pr8_absLoad: r.absLoad || (r.engineLoad || 0) * 0.85,
    fs1_o2UpB1: upstreamO2,
    fs2_o2DnB1: downstreamO2,
    fs5_catTempB1: r.catTempB1 || 420,
    fs7_catEff: catEff,
    fs10_driverScore: computeDriverScore(r),
    sl1_coolant: r.coolant || 0,
    sl3_battery: r.battery || 0,
    sl4_runtime: runtimeSeconds,
    sl7_mil: !!r.mil,
    sl8_dtcCount: r.dtcCount || 0,
    activeDTCs: [],
    sl11_degradation: degradation,
    mpgInstant: baselineMPG,
    mpgRecovery: mpgRecovery,
    governanceMode: computeMode(r),
  };
}

/**
 * Smooth RPM using EMA. At key-on/engine-off (<100 RPM), snap to 0.
 */
function smoothRPM(raw: number): number {
  if (raw < 100) { smoothedRPM = 0; return 0; }
  smoothedRPM = smoothedRPM === 0 ? raw : EMA_ALPHA * raw + (1 - EMA_ALPHA) * smoothedRPM;
  return Math.round(smoothedRPM);
}

/**
 * Smooth speed. Below 3 km/h snap to 0 (idle noise). EMA above that.
 */
function smoothSpeed(raw: number): number {
  if (raw < 3) { smoothedSpeed = 0; return 0; }
  smoothedSpeed = smoothedSpeed === 0 ? raw : EMA_ALPHA * raw + (1 - EMA_ALPHA) * smoothedSpeed;
  return Math.round(smoothedSpeed);
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
  const gph = r.maf * 0.0805 / 14.7 * 6.17;
  return gph > 0.01 ? Math.min(50, speedMph / gph) : 0;
}

// ── Governance Mode with Hysteresis ──
// Prevents seizure-like flickering by requiring a mode to be sustained
// for MIN_HOLD_MS before the UI switches. Dead zones on thresholds
// prevent bouncing when values hover near boundaries.
let currentMode = 'Nominal';
let modeHoldStart = Date.now();
const MIN_HOLD_MS = 3000; // Mode must be stable for 3 seconds before switching

function computeMode(r: Record<string, number>): string {
  // Key-on / Engine-off: ECU is powered but values are garbage.
  // Lock to Nominal — there's nothing to govern if the engine isn't running.
  if ((r.rpm || 0) < 100) {
    currentMode = 'Nominal';
    modeHoldStart = Date.now();
    return currentMode;
  }

  let candidateMode: string;

  if (r.mil) {
    candidateMode = 'Lifecycle Warning';
  } else if ((r.engineLoad || 0) > 75) {
    // Dead zone: must exceed 75 to enter, drops below 60 to exit
    candidateMode = 'Throughput Alert';
  } else if (currentMode === 'Throughput Alert' && (r.engineLoad || 0) > 60) {
    candidateMode = 'Throughput Alert'; // Stay in mode until clearly below
  } else if (Math.abs(r.stftB1 || 0) > 18) {
    // Dead zone: must exceed 18 to enter, drops below 12 to exit
    candidateMode = 'Process Drift';
  } else if (currentMode === 'Process Drift' && Math.abs(r.stftB1 || 0) > 12) {
    candidateMode = 'Process Drift'; // Stay in mode until clearly below
  } else if ((r.speed || 0) < 3) {
    candidateMode = 'Nominal';
  } else if (currentMode === 'Nominal' && (r.speed || 0) < 8) {
    candidateMode = 'Nominal'; // Stay nominal until speed is clearly above
  } else {
    candidateMode = 'Flow State';
  }

  // MIL always switches immediately (safety-critical)
  if (candidateMode === 'Lifecycle Warning') {
    currentMode = candidateMode;
    modeHoldStart = Date.now();
    return currentMode;
  }

  // If candidate differs from current, only switch after sustained hold
  if (candidateMode !== currentMode) {
    if (Date.now() - modeHoldStart >= MIN_HOLD_MS) {
      currentMode = candidateMode;
      modeHoldStart = Date.now();
    }
    // Otherwise keep the current mode — candidate hasn't been sustained long enough
  } else {
    modeHoldStart = Date.now(); // Reset hold timer while mode is stable
  }

  return currentMode;
}

/**
 * Main telemetry loop — polls WiFi adapter or falls back to simulated
 */
export function startWiFiTelemetryLoop(
  onData: (snapshot: TelemetrySnapshot) => void,
  intervalMs: number = 300
): () => void {
  startTime = Date.now();
  let sweepInFlight = false;

  const timer = setInterval(async () => {
    if (connectionState.isSimulated) {
      onData(simulatedTick());
      return;
    }

    if (elmSocket.isConnected && connectionState.status === 'connected') {
      // In-flight guard: a full PID sweep takes longer than the UI interval.
      // Never start a new sweep while one is running — overlapping sweeps
      // were the main cause of mismatched/blank readings.
      if (!sweepInFlight) {
        sweepInFlight = true;
        pollAllPIDs()
          .catch(() => {})
          .finally(() => { sweepInFlight = false; });
      }
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

export function disconnectWiFi(): void {
  elmSocket.close();
  connectionState = { status: 'disconnected', host: null, error: null, isSimulated: false, adapterInfo: null };
}

export function getWiFiStatus(): WiFiConnection {
  return { ...connectionState };
}

export function enterDemoMode(onStatusChange: (status: WiFiConnection) => void): void {
  connectionState = { status: 'connected', host: 'SIMULATED', error: null, isSimulated: true, adapterInfo: 'Demo Mode — 2019 F-150 5.0L V8' };
  onStatusChange({ ...connectionState });
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ═══════════════════════════════════════════════════════════════
// WiFi OBD-II Modes 02-0A
// Same protocol as BLE — just different transport (elmSocket.send)
// ═══════════════════════════════════════════════════════════════

// Re-export types from BLE connector for shared interfaces
import type { FreezeFrameData, O2TestResult, Mode06TestResult, VehicleInfo } from './BLEConnector';
export type { FreezeFrameData, O2TestResult, Mode06TestResult, VehicleInfo };

/**
 * Generic WiFi command sender with response parsing
 */
async function sendWiFiOBD(cmd: string, timeoutMs: number = 2000): Promise<string> {
  const response = await elmSocket.send(cmd, timeoutMs);
  if (!response || response.includes('NO DATA') || response.includes('ERROR') || response.includes('UNABLE')) return '';
  return response.replace(/[\s\r\n]/g, '');
}

/**
 * Decode DTC bytes — shared by Mode 03, 07, and 0A
 */
function decodeDTCBytes(data: string): string[] {
  const dtcs: string[] = [];
  for (let i = 0; i + 3 < data.length; i += 4) {
    const byte1 = parseInt(data.slice(i, i + 2), 16);
    const byte2 = parseInt(data.slice(i + 2, i + 4), 16);
    if (byte1 === 0 && byte2 === 0) continue;
    const category = ['P', 'C', 'B', 'U'][(byte1 >> 6) & 0x03];
    const digit2 = (byte1 >> 4) & 0x03;
    const digit3 = byte1 & 0x0F;
    const digit4 = (byte2 >> 4) & 0x0F;
    const digit5 = byte2 & 0x0F;
    dtcs.push(`${category}${digit2}${digit3.toString(16)}${digit4.toString(16)}${digit5.toString(16)}`.toUpperCase());
  }
  return dtcs;
}

function hexToAscii(hex: string): string {
  let str = '';
  for (let i = 0; i < hex.length; i += 2) {
    const charCode = parseInt(hex.slice(i, i + 2), 16);
    if (charCode > 31 && charCode < 127) str += String.fromCharCode(charCode);
  }
  return str.trim();
}

/**
 * Normalize a (possibly multi-frame) Mode 09 response into one hex string.
 * CAN vehicles return ISO-TP segmented output ("014" length line + "0:", "1:"
 * frame-index prefixes) which are NOT hex data — this strips them.
 */
function cleanMultiFrame(resp: string): string {
  return resp
    .replace(/SEARCHING\.*/gi, '')
    .split(/[\r\n]+/)
    .map(l => l.trim())
    .filter(l => l.length > 0 && !/^[0-9A-F]{1,3}$/i.test(l)) // drop ISO-TP length line
    .map(l => l.replace(/^[0-9A-F]{1,2}:\s*/i, ''))            // drop frame-index prefix
    .join('')
    .replace(/[\s>]/g, '')
    .toUpperCase();
}

/**
 * Extract a VIN from a raw Mode 09 PID 02 response. Handles CAN ISO-TP
 * segmented frames AND legacy multi-line "4902 0N ..." responses.
 */
function extractVIN(resp: string): string | null {
  const upper = cleanMultiFrame(resp);
  let allHex = '';
  let pos = 0;
  while (true) {
    const idx = upper.indexOf('4902', pos);
    if (idx < 0) break;
    const rest = upper.substring(idx + 6); // skip 4902 + count/sequence byte
    const next = rest.indexOf('4902');
    allHex += next >= 0 ? rest.substring(0, next) : rest;
    pos = idx + 6;
  }
  if (!allHex) return null;
  const ascii = hexToAscii(allHex).replace(/[^A-Z0-9]/gi, '').toUpperCase();
  // A real VIN is exactly 17 chars and never contains I, O, or Q
  const match = ascii.match(/[A-HJ-NPR-Z0-9]{17}/);
  if (match) return match[0];
  logEvent('WiFi', 'ERROR', `VIN decode incomplete — ascii: "${ascii}" from hex: "${allHex}"`);
  return ascii.length >= 11 ? ascii : null;
}

// ── Mode 02: Freeze Frame ──
export async function readFreezeFrameWiFi(): Promise<FreezeFrameData | null> {
  const dtcResp = await sendWiFiOBD('0202', 3000);
  if (!dtcResp) return null;

  const ff: FreezeFrameData = { dtcTrigger: '' };
  const dtcIdx = dtcResp.toUpperCase().indexOf('4202');
  if (dtcIdx >= 0) {
    const decoded = decodeDTCBytes(dtcResp.substring(dtcIdx + 4));
    if (decoded.length > 0) ff.dtcTrigger = decoded[0];
  }

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
    const resp = await sendWiFiOBD(cmd, 2000);
    if (!resp) continue;
    const pidHex = cmd.slice(2, 4).toUpperCase();
    const header = `42${pidHex}`;
    const idx = resp.toUpperCase().indexOf(header);
    if (idx >= 0) {
      const data = resp.substring(idx + header.length);
      const valueData = data.length > 2 ? data.substring(2) : data;
      try { (ff as any)[key] = parse(valueData); } catch { /* skip */ }
    }
  }
  return ff.dtcTrigger || ff.rpm !== undefined ? ff : null;
}

// ── Mode 03: Active DTCs ──
export async function readDTCsWiFi(): Promise<string[]> {
  const resp = await sendWiFiOBD('03', 5000);
  if (!resp) return [];
  const idx = resp.indexOf('43');
  return idx >= 0 ? decodeDTCBytes(resp.substring(idx + 2)) : [];
}

// ── Mode 04: Clear DTCs ──
export async function clearDTCsWiFi(): Promise<{ success: boolean; message: string }> {
  try {
    const resp = await sendWiFiOBD('04', 5000);
    if (!resp) return { success: false, message: 'No response from vehicle ECU' };
    if (resp.includes('44') || resp.toUpperCase().includes('OK')) {
      return { success: true, message: 'All trouble codes cleared. Check engine light will turn off. Drive cycle monitors have been reset.' };
    }
    return { success: false, message: `ECU rejected the clear command.` };
  } catch (e: any) {
    return { success: false, message: `Communication error: ${e.message || 'Unknown'}` };
  }
}

// ── Mode 05: O2 Sensor Monitoring ──
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
  0x01: 'Bank 1, Sensor 1', 0x02: 'Bank 1, Sensor 2',
  0x03: 'Bank 1, Sensor 3', 0x04: 'Bank 1, Sensor 4',
  0x05: 'Bank 2, Sensor 1', 0x06: 'Bank 2, Sensor 2',
  0x07: 'Bank 2, Sensor 3', 0x08: 'Bank 2, Sensor 4',
};

export async function readO2SensorTestsWiFi(): Promise<O2TestResult[]> {
  const results: O2TestResult[] = [];
  for (let testId = 0x01; testId <= 0x09; testId++) {
    for (let sensor = 0x01; sensor <= 0x04; sensor++) {
      const cmd = `05${testId.toString(16).padStart(2, '0')}${sensor.toString(16).padStart(2, '0')}`;
      const resp = await sendWiFiOBD(cmd, 2000);
      if (!resp) continue;
      const header = `45${testId.toString(16).padStart(2, '0').toUpperCase()}`;
      const idx = resp.toUpperCase().indexOf(header);
      if (idx < 0) continue;
      const data = resp.substring(idx + 4);
      if (data.length < 4) continue;
      const testDef = O2_TEST_NAMES[testId];
      if (!testDef) continue;
      const rawValue = parseInt(data.slice(0, 4), 16);
      results.push({
        testId, testName: testDef.name,
        sensorLocation: O2_SENSOR_LOCATIONS[sensor] || `Sensor ${sensor}`,
        value: rawValue * testDef.scale, unit: testDef.unit,
      });
    }
  }
  console.log(`[LumeScan WiFi] Mode 05: ${results.length} O2 sensor test results`);
  return results;
}

// ── Mode 06: On-Board Monitoring Test Results ──
const MID_NAMES: Record<number, string> = {
  0x01: 'Catalyst Monitor Bank 1', 0x02: 'Catalyst Monitor Bank 2',
  0x03: 'Catalyst Heater Monitor', 0x05: 'Evaporative System Monitor',
  0x06: 'Oxygen Sensor Monitor Bank 1', 0x07: 'Oxygen Sensor Monitor Bank 2',
  0x08: 'Oxygen Sensor Heater Monitor', 0x09: 'EGR/VVT System Monitor',
  0x0A: 'Secondary Air System Monitor', 0x0B: 'A/C Refrigerant Monitor',
  0x21: 'Catalyst Monitor (NMHC)', 0x22: 'NOx/SCR Catalyst Monitor',
  0x31: 'Misfire Monitor Cyl 1', 0x32: 'Misfire Monitor Cyl 2',
  0x33: 'Misfire Monitor Cyl 3', 0x34: 'Misfire Monitor Cyl 4',
  0x35: 'Misfire Monitor Cyl 5', 0x36: 'Misfire Monitor Cyl 6',
  0x37: 'Misfire Monitor Cyl 7', 0x38: 'Misfire Monitor Cyl 8',
  0x39: 'Misfire Monitor General', 0x41: 'A/C System Monitor',
};

const TID_NAMES: Record<number, { name: string; unit: string }> = {
  0x01: { name: 'Rich-to-Lean Response', unit: 'ms' },
  0x02: { name: 'Lean-to-Rich Response', unit: 'ms' },
  0x03: { name: 'Low Sensor Voltage', unit: 'V' },
  0x04: { name: 'High Sensor Voltage', unit: 'V' },
  0x05: { name: 'Voltage Amplitude', unit: 'V' },
  0x06: { name: 'Sensor Period', unit: 'ms' },
  0x80: { name: 'Efficiency Ratio', unit: '%' },
  0x81: { name: 'Misfire Count', unit: 'count' },
  0x82: { name: 'EVAP Leak Pressure', unit: 'Pa' },
  0x83: { name: 'Catalyst Light-off Time', unit: 's' },
  0x84: { name: 'EGR Flow Rate', unit: 'g/s' },
};

async function readMode06MIDWiFi(mid: number): Promise<Mode06TestResult[]> {
  const results: Mode06TestResult[] = [];
  const cmd = `06${mid.toString(16).padStart(2, '0')}`;
  const resp = await sendWiFiOBD(cmd, 3000);
  if (!resp) return results;

  let pos = 0;
  while (pos < resp.length) {
    const idx = resp.toUpperCase().indexOf('46', pos);
    if (idx < 0 || idx + 14 > resp.length) break;

    const midByte = parseInt(resp.slice(idx + 2, idx + 4), 16);
    const tid = parseInt(resp.slice(idx + 4, idx + 6), 16);
    const value = parseInt(resp.slice(idx + 6, idx + 10), 16);
    const minLimit = parseInt(resp.slice(idx + 10, idx + 14), 16);
    let maxLimit = 0xFFFF;
    if (idx + 18 <= resp.length) {
      maxLimit = parseInt(resp.slice(idx + 14, idx + 18), 16);
      pos = idx + 18;
    } else {
      pos = idx + 14;
    }
    if (isNaN(midByte) || isNaN(tid) || isNaN(value)) { pos = idx + 2; continue; }

    const midName = MID_NAMES[midByte] || `Monitor 0x${midByte.toString(16).toUpperCase()}`;
    const tidDef = TID_NAMES[tid] || { name: `Test 0x${tid.toString(16).toUpperCase()}`, unit: '' };
    const passed = value >= minLimit && value <= maxLimit;

    let percentToFail = 0;
    if (maxLimit > minLimit) {
      const range = maxLimit - minLimit;
      percentToFail = Math.min(100, (Math.abs(value - (minLimit + range / 2)) / (range / 2)) * 100);
    }

    results.push({
      mid: midByte, midName, tid, tidName: tidDef.name,
      value, minLimit, maxLimit, unit: tidDef.unit,
      passed, percentToFail: Math.round(percentToFail),
    });
  }
  return results;
}

export async function readAllMode06WiFi(): Promise<Mode06TestResult[]> {
  const allResults: Mode06TestResult[] = [];
  const mids = [0x01, 0x02, 0x05, 0x06, 0x07, 0x08, 0x09,
    0x31, 0x32, 0x33, 0x34, 0x35, 0x36, 0x37, 0x38, 0x39, 0x21, 0x22];
  for (const mid of mids) {
    allResults.push(...await readMode06MIDWiFi(mid));
  }
  console.log(`[LumeScan WiFi] Mode 06: ${allResults.length} on-board monitoring test results`);
  return allResults;
}

// ── Mode 07: Pending DTCs ──
export async function readPendingDTCsWiFi(): Promise<string[]> {
  const resp = await sendWiFiOBD('07', 5000);
  if (!resp) return [];
  const idx = resp.indexOf('47');
  return idx >= 0 ? decodeDTCBytes(resp.substring(idx + 2)) : [];
}

// ── Mode 09: Vehicle Information ──
export async function readVehicleInfoWiFi(): Promise<VehicleInfo> {
  const info: VehicleInfo = {};

  // VIN — multi-frame response; cheap adapters need a longer timeout
  const vinResp = await sendWiFiOBD('0902', 8000);
  if (vinResp && !vinResp.includes('NO DATA')) {
    const vin = extractVIN(vinResp);
    if (vin) info.vin = vin;
  }

  // Calibration ID
  const calResp = await sendWiFiOBD('0904', 3000);
  if (calResp) {
    const idx = calResp.toUpperCase().indexOf('4904');
    if (idx >= 0) info.calibrationId = hexToAscii(calResp.substring(idx + 6)) || undefined;
  }

  // CVN
  const cvnResp = await sendWiFiOBD('0906', 3000);
  if (cvnResp) {
    const idx = cvnResp.toUpperCase().indexOf('4906');
    if (idx >= 0) info.cvn = cvnResp.substring(idx + 6, idx + 14).toUpperCase();
  }

  // ECU Name
  const ecuResp = await sendWiFiOBD('090A', 3000);
  if (ecuResp) {
    const idx = ecuResp.toUpperCase().indexOf('490A');
    if (idx >= 0) info.ecuName = hexToAscii(ecuResp.substring(idx + 6)) || undefined;
  }

  if (info.vin) console.log(`[LumeScan WiFi] Mode 09: VIN = ${info.vin}`);
  return info;
}

// ── Mode 0A: Permanent DTCs ──
export async function readPermanentDTCsWiFi(): Promise<string[]> {
  const resp = await sendWiFiOBD('0A', 5000);
  if (!resp) return [];
  const idx = resp.indexOf('4A');
  return idx >= 0 ? decodeDTCBytes(resp.substring(idx + 2)) : [];
}
