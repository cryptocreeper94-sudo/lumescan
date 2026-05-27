/**
 * Lume-Auto — Simulated OBD-II Telemetry Engine
 * Produces realistic, time-varying vehicle data across all 42 governance nodes.
 * Based on a 2019 Ford F-150 5.0L V8 driving profile.
 */

// Utility: bounded random walk
const drift = (current: number, min: number, max: number, volatility: number) => {
  const delta = (Math.random() - 0.5) * volatility;
  return Math.min(max, Math.max(min, current + delta));
};

export interface TelemetrySnapshot {
  timestamp: number;
  // Throughput Base (TB)
  tb1_maf: number;          // g/s — Mass Air Flow
  tb2_fuelFlow: number;     // cc/min
  tb3_map: number;          // kPa — Manifold Absolute Pressure
  tb4_iat: number;          // °C — Intake Air Temp
  tb5_throttle: number;     // % — Throttle Position
  tb6_rpm: number;          // RPM
  tb7_speed: number;        // km/h
  tb8_volEff: number;       // % — Volumetric Efficiency
  tb9_afr: number;          // Air-Fuel Ratio
  tb10_baro: number;        // kPa — Barometric Pressure
  // Process Rate (PR)
  pr1_timing: number;       // ° BTDC — Ignition Timing
  pr2_stftB1: number;       // % — Short Term Fuel Trim Bank 1
  pr3_ltftB1: number;       // % — Long Term Fuel Trim Bank 1
  pr4_stftB2: number;       // % — Short Term Fuel Trim Bank 2
  pr5_ltftB2: number;       // % — Long Term Fuel Trim Bank 2
  pr6_combEff: number;      // % — Combustion Efficiency
  pr7_engLoad: number;      // % — Calculated Engine Load
  pr8_absLoad: number;      // % — Absolute Engine Load
  // Flow State (FS)
  fs1_o2UpB1: number;       // V — O2 Upstream Bank 1
  fs2_o2DnB1: number;       // V — O2 Downstream Bank 1
  fs5_catTempB1: number;    // °C — Catalyst Temp Bank 1
  fs7_catEff: number;       // % — Catalyst Efficiency
  fs10_driverScore: number; // 0-100 — Driver Behavior Score
  // System Lifecycle (SL)
  sl1_coolant: number;      // °C — Coolant Temperature
  sl3_battery: number;      // V — Battery Voltage
  sl4_runtime: number;      // seconds
  sl7_mil: boolean;         // Check Engine Light
  sl8_dtcCount: number;     // Diagnostic Trouble Code Count
  activeDTCs: string[];     // Array of active DTC codes
  sl11_degradation: number; // 0-100 health score
  // Computed
  mpgInstant: number;
  mpgRecovery: number;      // % improvement from governance
  governanceMode: string;
}

// Driving phases to cycle through for realistic demo
type Phase = 'idle' | 'accelerating' | 'cruising' | 'decelerating' | 'coasting';

const PHASE_SEQUENCE: { phase: Phase; durationMs: number }[] = [
  { phase: 'idle', durationMs: 5000 },
  { phase: 'accelerating', durationMs: 8000 },
  { phase: 'cruising', durationMs: 15000 },
  { phase: 'decelerating', durationMs: 4000 },
  { phase: 'coasting', durationMs: 6000 },
  { phase: 'accelerating', durationMs: 6000 },
  { phase: 'cruising', durationMs: 20000 },
  { phase: 'decelerating', durationMs: 5000 },
  { phase: 'idle', durationMs: 4000 },
];

const PHASE_TARGETS: Record<Phase, { rpm: number; speed: number; throttle: number; load: number }> = {
  idle:         { rpm: 680,  speed: 0,   throttle: 0,  load: 18 },
  accelerating: { rpm: 3200, speed: 72,  throttle: 55, load: 68 },
  cruising:     { rpm: 1800, speed: 65,  throttle: 22, load: 35 },
  decelerating: { rpm: 1200, speed: 30,  throttle: 0,  load: 12 },
  coasting:     { rpm: 900,  speed: 20,  throttle: 0,  load: 8 },
};

let state: TelemetrySnapshot = {
  timestamp: Date.now(),
  tb1_maf: 8.5, tb2_fuelFlow: 320, tb3_map: 35, tb4_iat: 32, tb5_throttle: 0,
  tb6_rpm: 680, tb7_speed: 0, tb8_volEff: 85, tb9_afr: 14.7, tb10_baro: 101.3,
  pr1_timing: 10, pr2_stftB1: 1.2, pr3_ltftB1: -0.8, pr4_stftB2: 0.5, pr5_ltftB2: -1.1,
  pr6_combEff: 97.8, pr7_engLoad: 18, pr8_absLoad: 12,
  fs1_o2UpB1: 0.45, fs2_o2DnB1: 0.72, fs5_catTempB1: 420, fs7_catEff: 94,
  fs10_driverScore: 82,
  sl1_coolant: 92, sl3_battery: 14.2, sl4_runtime: 0, sl7_mil: true, sl8_dtcCount: 1,
  activeDTCs: ['P0171'],
  sl11_degradation: 88,
  mpgInstant: 24.3, mpgRecovery: 12.4, governanceMode: 'Flow State',
};

let phaseIndex = 0;
let phaseStart = Date.now();
let totalRuntime = 0;

function getCurrentPhase(): Phase {
  const now = Date.now();
  const elapsed = now - phaseStart;
  if (elapsed >= PHASE_SEQUENCE[phaseIndex].durationMs) {
    phaseIndex = (phaseIndex + 1) % PHASE_SEQUENCE.length;
    phaseStart = now;
  }
  return PHASE_SEQUENCE[phaseIndex].phase;
}

function lerp(current: number, target: number, speed: number): number {
  return current + (target - current) * speed;
}

export function tick(): TelemetrySnapshot {
  const phase = getCurrentPhase();
  const t = PHASE_TARGETS[phase];
  const s = state;
  const dt = 0.1; // 100ms tick

  // Core signals — smooth interpolation toward phase targets
  s.tb6_rpm = lerp(s.tb6_rpm, t.rpm + (Math.random() - 0.5) * 80, 0.08);
  s.tb7_speed = lerp(s.tb7_speed, t.speed + (Math.random() - 0.5) * 3, 0.06);
  s.tb5_throttle = lerp(s.tb5_throttle, t.throttle + (Math.random() - 0.5) * 4, 0.12);
  s.pr7_engLoad = lerp(s.pr7_engLoad, t.load + (Math.random() - 0.5) * 5, 0.08);

  // Derived signals
  s.tb1_maf = s.tb6_rpm * 0.005 + s.tb5_throttle * 0.15 + drift(0, -1, 1, 0.5);
  s.tb2_fuelFlow = s.tb1_maf * 22 + drift(0, -10, 10, 5);
  s.tb3_map = 30 + s.tb5_throttle * 0.7 + drift(0, -2, 2, 1);
  s.tb4_iat = drift(s.tb4_iat, 28, 42, 0.2);
  s.tb8_volEff = 82 + s.tb5_throttle * 0.12 + drift(0, -2, 2, 0.5);
  s.tb9_afr = drift(s.tb9_afr, 14.2, 15.1, 0.15);
  s.tb10_baro = drift(s.tb10_baro, 100.5, 102, 0.1);

  // Process Rate
  s.pr1_timing = 8 + (s.tb6_rpm / 400) + drift(0, -1, 1, 0.3);
  s.pr2_stftB1 = drift(s.pr2_stftB1, -4, 4, 0.3);
  s.pr3_ltftB1 = drift(s.pr3_ltftB1, -3, 2, 0.05);
  s.pr4_stftB2 = drift(s.pr4_stftB2, -4, 4, 0.3);
  s.pr5_ltftB2 = drift(s.pr5_ltftB2, -3, 2, 0.05);
  s.pr6_combEff = 95 + (s.tb9_afr > 14.5 && s.tb9_afr < 14.9 ? 3 : 0) + drift(0, -1, 1, 0.2);
  s.pr8_absLoad = s.pr7_engLoad * 0.85 + drift(0, -2, 2, 0.5);

  // Flow State
  s.fs1_o2UpB1 = 0.1 + Math.sin(Date.now() / 500) * 0.35 + 0.35; // oscillating 0.1-0.8V
  s.fs2_o2DnB1 = drift(s.fs2_o2DnB1, 0.65, 0.78, 0.02);
  s.fs5_catTempB1 = lerp(s.fs5_catTempB1, phase === 'idle' ? 380 : 450, 0.02);
  s.fs7_catEff = drift(s.fs7_catEff, 91, 96, 0.1);
  s.fs10_driverScore = lerp(s.fs10_driverScore,
    phase === 'cruising' ? 92 : phase === 'accelerating' ? 65 : phase === 'coasting' ? 88 : 75, 0.03);

  // System Lifecycle
  s.sl1_coolant = drift(s.sl1_coolant, 88, 96, 0.1);
  s.sl3_battery = drift(s.sl3_battery, 13.8, 14.4, 0.05);
  totalRuntime += 100;
  s.sl4_runtime = Math.floor(totalRuntime / 1000);
  s.sl11_degradation = drift(s.sl11_degradation, 85, 92, 0.02);

  // Computed
  if (s.tb7_speed > 5 && s.tb2_fuelFlow > 50) {
    s.mpgInstant = (s.tb7_speed * 0.621371) / (s.tb2_fuelFlow / 3785.41 * 3600 / 1000) * 0.1;
    s.mpgInstant = Math.min(45, Math.max(8, s.mpgInstant));
  } else if (s.tb7_speed < 5) {
    s.mpgInstant = 0; // idling
  }
  s.mpgRecovery = drift(s.mpgRecovery, 10, 16, 0.05);

  // Governance mode
  if (phase === 'idle') s.governanceMode = 'Nominal';
  else if (s.fs10_driverScore > 85) s.governanceMode = 'Flow State';
  else if (s.pr7_engLoad > 60) s.governanceMode = 'Throughput Alert';
  else s.governanceMode = 'Process Monitoring';

  s.timestamp = Date.now();
  return { ...s };
}

export function generateConditionReport() {
  const s = state;
  return {
    timestamp: new Date().toISOString(),
    vehicle: '2019 Ford F-150 5.0L V8',
    vin: '1FTEW1EP4KKE•••••',
    overallHealth: Math.round(s.sl11_degradation),
    laneReady: s.sl8_dtcCount === 0 && !s.sl7_mil && s.sl3_battery > 12.0,
    sections: [
      {
        name: 'Drivetrain',
        status: 'nominal',
        items: [
          { label: 'Engine Load (PR7)', value: `${s.pr7_engLoad.toFixed(1)}%`, status: 'ok' },
          { label: 'Combustion Efficiency (PR6)', value: `${s.pr6_combEff.toFixed(1)}%`, status: s.pr6_combEff > 95 ? 'ok' : 'caution' },
          { label: 'Volumetric Efficiency (TB8)', value: `${s.tb8_volEff.toFixed(1)}%`, status: 'ok' },
        ]
      },
      {
        name: 'Emissions',
        status: s.fs7_catEff > 90 ? 'nominal' : 'caution',
        items: [
          { label: 'Catalyst Efficiency (FS7)', value: `${s.fs7_catEff.toFixed(1)}%`, status: s.fs7_catEff > 90 ? 'ok' : 'caution' },
          { label: 'O2 Upstream B1 (FS1)', value: `${s.fs1_o2UpB1.toFixed(2)}V`, status: 'ok' },
          { label: 'O2 Downstream B1 (FS2)', value: `${s.fs2_o2DnB1.toFixed(2)}V`, status: 'ok' },
          { label: 'Catalyst Temp (FS5)', value: `${s.fs5_catTempB1.toFixed(0)}°C`, status: 'ok' },
        ]
      },
      {
        name: 'Electrical',
        status: s.sl3_battery > 12.5 ? 'nominal' : 'warning',
        items: [
          { label: 'Battery Voltage (SL3)', value: `${s.sl3_battery.toFixed(1)}V`, status: s.sl3_battery > 12.5 ? 'ok' : 'warning' },
          { label: 'MIL Status (SL7)', value: s.sl7_mil ? 'ON' : 'OFF', status: s.sl7_mil ? 'critical' : 'ok' },
          { label: 'DTC Count (SL8)', value: `${s.sl8_dtcCount}`, status: s.sl8_dtcCount > 0 ? 'warning' : 'ok' },
        ]
      },
      {
        name: 'Thermal',
        status: 'nominal',
        items: [
          { label: 'Coolant Temp (SL1)', value: `${s.sl1_coolant.toFixed(1)}°C`, status: s.sl1_coolant < 105 ? 'ok' : 'warning' },
          { label: 'Intake Air Temp (TB4)', value: `${s.tb4_iat.toFixed(1)}°C`, status: 'ok' },
        ]
      },
      {
        name: 'Fuel System',
        status: Math.abs(s.pr3_ltftB1) < 10 ? 'nominal' : 'caution',
        items: [
          { label: 'Air-Fuel Ratio (TB9)', value: `${s.tb9_afr.toFixed(1)}:1`, status: s.tb9_afr > 14.0 && s.tb9_afr < 15.0 ? 'ok' : 'caution' },
          { label: 'STFT B1 (PR2)', value: `${s.pr2_stftB1 > 0 ? '+' : ''}${s.pr2_stftB1.toFixed(1)}%`, status: Math.abs(s.pr2_stftB1) < 10 ? 'ok' : 'caution' },
          { label: 'LTFT B1 (PR3)', value: `${s.pr3_ltftB1 > 0 ? '+' : ''}${s.pr3_ltftB1.toFixed(1)}%`, status: Math.abs(s.pr3_ltftB1) < 10 ? 'ok' : 'caution' },
        ]
      },
    ],
    componentDegradation: Math.round(s.sl11_degradation),
    summary: s.sl8_dtcCount === 0 && !s.sl7_mil
      ? 'All 42 governance nodes nominal. No active or pending fault codes. Vehicle is lane-ready.'
      : `${s.sl8_dtcCount} diagnostic trouble code(s) detected. Manual inspection recommended before lane assignment.`,
  };
}
