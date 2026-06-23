import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';

export type TransportType = 'BLE' | 'WiFi' | 'SYSTEM';
export type DirectionType = 'TX' | 'RX' | 'INFO' | 'ERROR';

export interface LogEntry {
  timestamp: number;
  timeString: string;
  transport: TransportType;
  direction: DirectionType;
  data: string;
}

const MAX_LOG_ENTRIES = 5000;
let logBuffer: LogEntry[] = [];
let recordingEnabled = true;

/**
 * Log a raw hardware event.
 */
export function logEvent(transport: TransportType, direction: DirectionType, data: string) {
  if (!recordingEnabled) return;
  
  const now = new Date();
  const entry: LogEntry = {
    timestamp: now.getTime(),
    timeString: now.toISOString(),
    transport,
    direction,
    data
  };

  logBuffer.push(entry);

  // Prevent memory leaks on long drives
  if (logBuffer.length > MAX_LOG_ENTRIES) {
    logBuffer.shift();
  }
}

/**
 * Clear the current log buffer.
 */
export function clearLog() {
  logBuffer = [];
  logEvent('SYSTEM', 'INFO', 'Diagnostic log cleared.');
}

/**
 * Export the log buffer to a text file and open the native share sheet.
 */
export async function exportLog(): Promise<boolean> {
  if (logBuffer.length === 0) {
    console.warn('[FlightRecorder] Log is empty, nothing to export.');
    return false;
  }

  try {
    const filename = `LumeScan_Diagnostic_${new Date().getTime()}.txt`;
    const FS = FileSystem as any;
    const fileUri = `${FS.documentDirectory}${filename}`;

    // Format log entries into a readable text file
    let logContent = `LumeScan Diagnostic Flight Recorder\nGenerated: ${new Date().toISOString()}\n=========================================\n\n`;
    
    for (const entry of logBuffer) {
      logContent += `[${entry.timeString}] [${entry.transport}] [${entry.direction}] ${entry.data}\n`;
    }

    // Write file
    await FS.writeAsStringAsync(fileUri, logContent, {
      encoding: FS.EncodingType?.UTF8 || 'utf8',
    });

    // Check if sharing is available
    const canShare = await Sharing.isAvailableAsync();
    if (canShare) {
      await Sharing.shareAsync(fileUri, {
        mimeType: 'text/plain',
        dialogTitle: 'Export LumeScan Diagnostic Log',
      });
      return true;
    } else {
      console.warn('[FlightRecorder] Sharing is not available on this device.');
      return false;
    }
  } catch (err: any) {
    console.error('[FlightRecorder] Failed to export log:', err?.message);
    return false;
  }
}
