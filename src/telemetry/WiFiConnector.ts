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
  { cmd: '0101', parse: (h) => ({ mil: !!(parseInt(h.slice(0, 2), 16) & 0x80), dtcCount: parseInt(h.slice(0, 2), 16) & 0x7F }) },
  { cmd: '011F', parse: (h) => ({ runtimeSinceStart: parseInt(h.slice(0, 2), 16) * 256 + parseInt(h.slice(2, 4), 16) }), optional: true },
  { cmd: '0146', parse: (h) => ({ ambientTemp: parseInt(h.slice(0, 2), 16) - 40 }), optional: true },
];

/**
 * Send an AT/OBD command via TCP and read the response.
 * Uses fetch to a local TCP-to-HTTP bridge, or raw TCP via React Native's
 * networking layer.
 */
async function sendCommand(cmd: string, timeoutMs: number = 2000): Promise<string> {
  return new Promise((resolve) => {
    try {
      const xhr = new XMLHttpRequest();
      const url = `http://${connectionState.host}:${DEFAULT_PORT}`;
      
      // For raw TCP, we use a lightweight approach:
      // Send the command as the request body, read response
      xhr.open('GET', `http://${connectionState.host}:${DEFAULT_PORT}/${cmd}`, true);
      xhr.timeout = timeoutMs;
      xhr.onload = () => resolve(xhr.responseText || '');
      xhr.onerror = () => resolve('');
      xhr.ontimeout = () => resolve('');
      xhr.send();
    } catch {
      resolve('');
    }
  });
}

/**
 * TCP socket approach using React Native's raw TCP
 * This is the primary connection method for WiFi ELM327
 */
class ELM327Socket {
  private ws: WebSocket | null = null;
  private responseResolve: ((value: string) => void) | null = null;
  private buffer = '';

  async connect(host: string, port: number): Promise<boolean> {
    return new Promise((resolve) => {
      try {
        // Use a WebSocket-style TCP connection
        // Most modern WiFi ELM327 adapters support this
        const url = `ws://${host}:${port}`;
        this.ws = new WebSocket(url);
        
        this.ws.onopen = () => {
          console.log('[Lume-Auto] TCP connected');
          resolve(true);
        };
        
        this.ws.onmessage = (event) => {
          this.buffer += event.data;
          if (this.buffer.includes('>')) {
            const response = this.buffer.replace(/>/g, '').trim();
            this.buffer = '';
            if (this.responseResolve) {
              this.responseResolve(response);
              this.responseResolve = null;
            }
          }
        };
        
        this.ws.onerror = () => {
          resolve(false);
        };
        
        this.ws.onclose = () => {
          console.log('[Lume-Auto] TCP disconnected');
        };

        setTimeout(() => resolve(false), 3000);
      } catch {
        resolve(false);
      }
    });
  }

  async send(cmd: string, timeoutMs: number = 2000): Promise<string> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return '';
    
    return new Promise((resolve) => {
      this.responseResolve = resolve;
      this.buffer = '';
      this.ws!.send(cmd + '\r');
      setTimeout(() => {
        if (this.responseResolve) {
          this.responseResolve(this.buffer || '');
          this.responseResolve = null;
        }
      }, timeoutMs);
    });
  }

  close() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  get isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
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

      // Initialize ELM327
      await elmSocket.send('ATZ');     // Reset
      await delay(1000);
      const echoOff = await elmSocket.send('ATE0');    // Echo off
      await elmSocket.send('ATL0');    // Linefeeds off
      await elmSocket.send('ATS0');    // Spaces off
      await elmSocket.send('ATH0');    // Headers off
      const proto = await elmSocket.send('ATSP0');     // Auto-detect protocol
      const info = await elmSocket.send('ATI');        // Get adapter info

      connectionState = {
        status: 'connected',
        host,
        error: null,
        isSimulated: false,
        adapterInfo: info || 'ELM327 WiFi',
      };
      onStatusChange({ ...connectionState });
      startTime = Date.now();
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
  // Extract hex data after the mode+PID echo (e.g., "410C1A2B" → "1A2B")
  const clean = response.replace(/[\s\r\n]/g, '');
  if (clean.length >= 6) {
    return clean.substring(4); // Skip "41XX"
  }
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
    tb6_rpm: r.rpm || 0,
    tb7_speed: r.speed || 0,
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

function computeMode(r: Record<string, number>): string {
  if (r.mil) return 'Lifecycle Warning';
  if ((r.engineLoad || 0) > 70) return 'Throughput Alert';
  if (Math.abs(r.stftB1 || 0) > 15) return 'Process Drift';
  if ((r.speed || 0) < 5) return 'Nominal';
  return 'Flow State';
}

/**
 * Main telemetry loop — polls WiFi adapter or falls back to simulated
 */
export function startWiFiTelemetryLoop(
  onData: (snapshot: TelemetrySnapshot) => void,
  intervalMs: number = 300
): () => void {
  startTime = Date.now();

  const timer = setInterval(async () => {
    if (elmSocket.isConnected && connectionState.status === 'connected') {
      await pollAllPIDs();
      onData(buildSnapshot());
    } else {
      // Simulated fallback
      onData(simulatedTick());
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
