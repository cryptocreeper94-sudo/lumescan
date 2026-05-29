/**
 * LumeScan — Maintenance Counter Store
 * ======================================
 * AsyncStorage-backed maintenance counter persistence.
 * Strictly advisory — does NOT touch the deterministic engine or trust fabric.
 *
 * DarkWave Studios LLC — Copyright 2026
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = '@lumescan_maintenance';
const HISTORY_KEY = '@lumescan_service_history';

export type ServiceStatus = 'good' | 'upcoming' | 'due' | 'overdue';

export interface MaintenanceItem {
  id: string;
  label: string;
  iconName: string; // lucide icon name
  intervalMiles: number;
  intervalDays: number;
  thresholdMiles: number; // warning window
  currentMiles: number;
  currentDays: number;
  lastServiceDate: string; // ISO
  lastServiceMiles: number;
  isCustom: boolean;
}

export interface MaintenanceState {
  items: MaintenanceItem[];
  totalSessionMiles: number;
  oilLifePct: number; // OEM if available, else estimated
  lastSyncTimestamp: string;
}

export interface ServiceHistoryEntry {
  id: string;
  itemId: string;
  itemLabel: string;
  date: string;
  mileage: number;
  notes?: string;
}

// Default maintenance items
const DEFAULT_ITEMS: MaintenanceItem[] = [
  { id: 'oil_change', label: 'Oil Change', iconName: 'Droplets', intervalMiles: 5000, intervalDays: 180, thresholdMiles: 500, currentMiles: 3200, currentDays: 120, lastServiceDate: new Date(Date.now() - 120 * 86400000).toISOString(), lastServiceMiles: 0, isCustom: false },
  { id: 'tire_rotation', label: 'Tire Rotation', iconName: 'RotateCcw', intervalMiles: 7500, intervalDays: 365, thresholdMiles: 750, currentMiles: 4800, currentDays: 200, lastServiceDate: new Date(Date.now() - 200 * 86400000).toISOString(), lastServiceMiles: 0, isCustom: false },
  { id: 'brake_inspection', label: 'Brake Inspection', iconName: 'Disc', intervalMiles: 15000, intervalDays: 365, thresholdMiles: 1500, currentMiles: 8200, currentDays: 280, lastServiceDate: new Date(Date.now() - 280 * 86400000).toISOString(), lastServiceMiles: 0, isCustom: false },
  { id: 'air_filter', label: 'Air Filter', iconName: 'Wind', intervalMiles: 15000, intervalDays: 365, thresholdMiles: 1500, currentMiles: 6100, currentDays: 210, lastServiceDate: new Date(Date.now() - 210 * 86400000).toISOString(), lastServiceMiles: 0, isCustom: false },
  { id: 'transmission', label: 'Trans Fluid', iconName: 'Cog', intervalMiles: 30000, intervalDays: 730, thresholdMiles: 3000, currentMiles: 12000, currentDays: 400, lastServiceDate: new Date(Date.now() - 400 * 86400000).toISOString(), lastServiceMiles: 0, isCustom: false },
  { id: 'coolant', label: 'Coolant Flush', iconName: 'Thermometer', intervalMiles: 30000, intervalDays: 730, thresholdMiles: 3000, currentMiles: 15000, currentDays: 500, lastServiceDate: new Date(Date.now() - 500 * 86400000).toISOString(), lastServiceMiles: 0, isCustom: false },
];

function getDefaultState(): MaintenanceState {
  return {
    items: [...DEFAULT_ITEMS],
    totalSessionMiles: 0,
    oilLifePct: 78,
    lastSyncTimestamp: new Date().toISOString(),
  };
}

export async function loadMaintenanceState(): Promise<MaintenanceState> {
  try {
    const json = await AsyncStorage.getItem(STORAGE_KEY);
    if (json) {
      const state = JSON.parse(json) as MaintenanceState;
      // Update currentDays based on elapsed time since last service
      for (const item of state.items) {
        const daysSince = Math.floor((Date.now() - new Date(item.lastServiceDate).getTime()) / 86400000);
        item.currentDays = daysSince;
      }
      return state;
    }
  } catch (e) {
    console.warn('[Maintenance] Failed to load state:', e);
  }
  return getDefaultState();
}

export async function saveMaintenanceState(state: MaintenanceState): Promise<void> {
  try {
    state.lastSyncTimestamp = new Date().toISOString();
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.warn('[Maintenance] Failed to save state:', e);
  }
}

export function getItemStatus(item: MaintenanceItem): ServiceStatus {
  const milesRemaining = item.intervalMiles - item.currentMiles;
  const daysRemaining = item.intervalDays - item.currentDays;

  if (milesRemaining <= 0 || daysRemaining <= 0) return 'overdue';
  if (milesRemaining <= item.thresholdMiles || daysRemaining <= 30) return 'due';
  if (milesRemaining <= item.thresholdMiles * 2 || daysRemaining <= 60) return 'upcoming';
  return 'good';
}

export function getMilesRemaining(item: MaintenanceItem): number {
  return Math.max(0, item.intervalMiles - item.currentMiles);
}

export function getDaysRemaining(item: MaintenanceItem): number {
  return Math.max(0, item.intervalDays - item.currentDays);
}

export function getProgressPct(item: MaintenanceItem): number {
  return Math.min(1, item.currentMiles / item.intervalMiles);
}

export async function resetServiceItem(state: MaintenanceState, itemId: string, notes?: string): Promise<MaintenanceState> {
  const item = state.items.find(i => i.id === itemId);
  if (!item) return state;

  // Record history
  await addHistoryEntry({
    id: `${itemId}_${Date.now()}`,
    itemId: item.id,
    itemLabel: item.label,
    date: new Date().toISOString(),
    mileage: item.currentMiles,
    notes,
  });

  // Reset counters
  item.currentMiles = 0;
  item.currentDays = 0;
  item.lastServiceDate = new Date().toISOString();

  await saveMaintenanceState(state);
  return { ...state };
}

export function addCustomItem(state: MaintenanceState, label: string, intervalMiles: number, intervalDays: number): MaintenanceState {
  const id = `custom_${Date.now()}`;
  state.items.push({
    id, label, iconName: 'Wrench',
    intervalMiles, intervalDays,
    thresholdMiles: Math.max(500, Math.floor(intervalMiles * 0.1)),
    currentMiles: 0, currentDays: 0,
    lastServiceDate: new Date().toISOString(),
    lastServiceMiles: 0, isCustom: true,
  });
  return { ...state };
}

export function removeCustomItem(state: MaintenanceState, itemId: string): MaintenanceState {
  state.items = state.items.filter(i => i.id !== itemId);
  return { ...state };
}

// Sync mileage from a telemetry session
export function syncMileage(state: MaintenanceState, sessionMiles: number, oilLifePct?: number): MaintenanceState {
  for (const item of state.items) {
    item.currentMiles += sessionMiles;
  }
  state.totalSessionMiles += sessionMiles;
  if (oilLifePct !== undefined) {
    state.oilLifePct = oilLifePct;
  }
  return { ...state };
}

// ── Service History ──

export async function loadHistory(): Promise<ServiceHistoryEntry[]> {
  try {
    const json = await AsyncStorage.getItem(HISTORY_KEY);
    if (json) return JSON.parse(json);
  } catch { /* noop */ }
  return [];
}

export async function addHistoryEntry(entry: ServiceHistoryEntry): Promise<void> {
  const history = await loadHistory();
  history.unshift(entry); // newest first
  // Keep last 100 entries
  if (history.length > 100) history.length = 100;
  try {
    await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  } catch { /* noop */ }
}
