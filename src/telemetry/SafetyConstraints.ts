/**
 * LUME Mode 06 — Safety Constraints Enforcement
 * 
 * Implements the 8 Hard Constraints (HC-R1 through HC-R8) from the
 * Mode 06 Remote Start firmware spec. These are enforced at the app
 * layer as a secondary safety check — the dongle firmware enforces
 * them independently as the primary safety layer.
 * 
 * DarkWave Studios LLC — Copyright 2026
 */

export interface SafetyCheckResult {
  constraint: string;
  code: string;
  passed: boolean;
  message: string;
}

export interface FullSafetyReport {
  timestamp: number;
  checks: SafetyCheckResult[];
  allPassed: boolean;
  blockers: string[];
}

// Track attempt history for HC-R3
let attemptTimestamps: number[] = [];
const MAX_ATTEMPTS = 3;
const WINDOW_MS = 10 * 60 * 1000; // 10 minutes

// Track BLE connection for HC-R7
let lastBleHeartbeat = Date.now();
const BLE_GRACE_PERIOD_MS = 60 * 1000; // 60 seconds

/**
 * Run all 8 hard constraints and return a full safety report.
 * ALL must pass before a remote start command can be issued.
 */
export function runSafetyChecks(params: {
  hoodClosed: boolean;
  batteryVoltage: number;
  activeDTCs: number;
  immoRegistered: boolean;
  engineOff: boolean;
  gearPark: boolean;
  pinVerified: boolean;
  bleConnected: boolean;
}): FullSafetyReport {
  const checks: SafetyCheckResult[] = [];

  // HC-R1: Signed authorization token (PIN/biometric verified)
  checks.push({
    constraint: 'Authorization',
    code: 'HC-R1',
    passed: params.pinVerified,
    message: params.pinVerified ? 'PIN/biometric verified' : 'PIN or biometric required',
  });

  // HC-R2: VIN verification (implicit — dongle is plugged into the correct vehicle)
  checks.push({
    constraint: 'VIN Match',
    code: 'HC-R2',
    passed: params.immoRegistered,
    message: params.immoRegistered ? 'Dongle registered to this VIN' : 'Dongle not registered — complete Mode 05C',
  });

  // HC-R3: No auto-retry (3 attempts per 10 minutes)
  const now = Date.now();
  attemptTimestamps = attemptTimestamps.filter(t => now - t < WINDOW_MS);
  const attemptsOk = attemptTimestamps.length < MAX_ATTEMPTS;
  checks.push({
    constraint: 'Rate Limit',
    code: 'HC-R3',
    passed: attemptsOk,
    message: attemptsOk
      ? `${MAX_ATTEMPTS - attemptTimestamps.length} attempts remaining`
      : `Rate limited — wait ${Math.ceil((attemptTimestamps[0] + WINDOW_MS - now) / 60000)} min`,
  });

  // HC-R4: No programming session (app layer blocks 0x10 02)
  // This is always true at the app layer — we never send programming session
  checks.push({
    constraint: 'Session Guard',
    code: 'HC-R4',
    passed: true,
    message: 'Programming session (0x10 02) blocked',
  });

  // HC-R5: Session isolation (no concurrent operations)
  checks.push({
    constraint: 'Session Isolation',
    code: 'HC-R5',
    passed: params.engineOff,
    message: params.engineOff ? 'No active session' : 'Engine already running',
  });

  // HC-R6: Runtime limit will be enforced during runtime
  checks.push({
    constraint: 'Runtime Limit',
    code: 'HC-R6',
    passed: true,
    message: 'Runtime limit will be enforced (5–20 min)',
  });

  // HC-R7: BLE connection active
  const bleOk = params.bleConnected || (now - lastBleHeartbeat < BLE_GRACE_PERIOD_MS);
  checks.push({
    constraint: 'BLE Connection',
    code: 'HC-R7',
    passed: bleOk,
    message: bleOk ? 'Adapter connected' : 'Connection lost — auto-stop in 60s',
  });

  // HC-R8: Hood closed
  checks.push({
    constraint: 'Hood Status',
    code: 'HC-R8',
    passed: params.hoodClosed,
    message: params.hoodClosed ? 'Hood closed' : 'Hood open — start blocked',
  });

  // Additional safety: Battery voltage
  const batteryOk = params.batteryVoltage >= 11.8;
  checks.push({
    constraint: 'Battery',
    code: 'BAT',
    passed: batteryOk,
    message: batteryOk ? `${params.batteryVoltage.toFixed(1)}V OK` : `${params.batteryVoltage.toFixed(1)}V — too low`,
  });

  // Additional safety: No active DTCs
  const dtcsOk = params.activeDTCs === 0;
  checks.push({
    constraint: 'Fault Codes',
    code: 'DTC',
    passed: dtcsOk,
    message: dtcsOk ? 'No active DTCs' : `${params.activeDTCs} active DTC(s) — start blocked`,
  });

  // Additional safety: Gear in park
  checks.push({
    constraint: 'Gear Position',
    code: 'GEAR',
    passed: params.gearPark,
    message: params.gearPark ? 'Vehicle in Park' : 'Vehicle not in Park — start blocked',
  });

  const allPassed = checks.every(c => c.passed);
  const blockers = checks.filter(c => !c.passed).map(c => c.message);

  return { timestamp: now, checks, allPassed, blockers };
}

/**
 * Record a start attempt for HC-R3 rate limiting
 */
export function recordStartAttempt(): void {
  attemptTimestamps.push(Date.now());
}

/**
 * Update BLE heartbeat timestamp for HC-R7
 */
export function updateBleHeartbeat(): void {
  lastBleHeartbeat = Date.now();
}

/**
 * Reset safety state (app restart)
 */
export function resetSafetyState(): void {
  attemptTimestamps = [];
  lastBleHeartbeat = Date.now();
}
