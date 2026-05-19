/**
 * Sanitized logger — writes rotating log files with all tokens/secrets masked.
 *
 * Log directory: %APPDATA%/modzero-client/logs/  (or ~/.config on Linux/Mac)
 */

import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';

const LOG_DIR = path.join(app.getPath('userData'), 'logs');
const MAX_LOG_FILES = 5;
const MAX_LOG_SIZE = 5 * 1024 * 1024; // 5 MB per file

let currentLogFile = '';
let logLevel: 'info' | 'debug' = 'info';

// Patterns to sanitize from log output
const SENSITIVE_PATTERNS = [
  /Bearer\s+[A-Za-z0-9\-_\.]+/gi,                          // Bearer tokens
  /eyJ[A-Za-z0-9\-_]+\.eyJ[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+/g, // JWT three-segment
  /[A-Za-z0-9\-_]{40,}/g,                                   // Long opaque tokens (40+ chars)
  /"(access_token|token|secret|password|connector_secret|enroll_token)"\s*:\s*"[^"]+"/gi,
  /X-Connector-Secret:\s*\S+/gi,
];

function sanitize(msg: string): string {
  let result = msg;
  for (const pattern of SENSITIVE_PATTERNS) {
    result = result.replace(pattern, (match) => {
      // Keep first 8 chars + mask the rest
      if (match.length > 12) {
        return match.substring(0, 8) + '***REDACTED***';
      }
      return '***REDACTED***';
    });
  }
  return result;
}

function ensureLogDir(): void {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
}

function rotateLogsIfNeeded(): void {
  if (!currentLogFile || !fs.existsSync(currentLogFile)) {
    currentLogFile = path.join(LOG_DIR, `modzero-${Date.now()}.log`);
    return;
  }

  const stats = fs.statSync(currentLogFile);
  if (stats.size > MAX_LOG_SIZE) {
    currentLogFile = path.join(LOG_DIR, `modzero-${Date.now()}.log`);
  }

  // Remove old log files beyond MAX_LOG_FILES
  const files = fs.readdirSync(LOG_DIR)
    .filter(f => f.startsWith('modzero-') && f.endsWith('.log'))
    .sort()
    .reverse();

  for (let i = MAX_LOG_FILES; i < files.length; i++) {
    fs.unlinkSync(path.join(LOG_DIR, files[i]));
  }
}

function writeLog(level: string, message: string): void {
  ensureLogDir();
  rotateLogsIfNeeded();

  const timestamp = new Date().toISOString();
  const sanitized = sanitize(message);
  const line = `${timestamp} [${level.toUpperCase()}] ${sanitized}\n`;

  fs.appendFileSync(currentLogFile, line, 'utf-8');

  // Also print to console (sanitized)
  if (level === 'error') {
    console.error(`[ModZero] ${sanitized}`);
  } else {
    console.log(`[ModZero] ${sanitized}`);
  }
}

export const logger = {
  info(msg: string): void {
    writeLog('info', msg);
  },
  warn(msg: string): void {
    writeLog('warn', msg);
  },
  error(msg: string): void {
    writeLog('error', msg);
  },
  debug(msg: string): void {
    if (logLevel === 'debug') {
      writeLog('debug', msg);
    }
  },
  setLevel(level: 'info' | 'debug'): void {
    logLevel = level;
    writeLog('info', `Log level set to: ${level}`);
  },
  getLevel(): string {
    return logLevel;
  },
  getLogDir(): string {
    ensureLogDir();
    return LOG_DIR;
  },
  getLogFiles(): string[] {
    ensureLogDir();
    return fs.readdirSync(LOG_DIR)
      .filter(f => f.endsWith('.log'))
      .map(f => path.join(LOG_DIR, f));
  },
};
