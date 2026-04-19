/**
 * Log zip and upload module.
 *
 * Collects all log files, creates a sanitized zip archive, and uploads
 * it to the controller via POST /api/client/logs/upload.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as archiver from 'archiver';
import axios from 'axios';
import { logger } from './logger';

/**
 * Create a zip archive of all log files.
 * Returns the path to the zip file.
 */
export async function createLogArchive(logDir: string): Promise<string> {
  const zipPath = path.join(logDir, `modzero-logs-${Date.now()}.zip`);
  const output = fs.createWriteStream(zipPath);
  const archive = archiver.default('zip', { zlib: { level: 9 } });

  return new Promise((resolve, reject) => {
    output.on('close', () => resolve(zipPath));
    archive.on('error', reject);

    archive.pipe(output);

    // Add all .log files
    const logFiles = fs.readdirSync(logDir).filter(f => f.endsWith('.log'));
    for (const file of logFiles) {
      archive.file(path.join(logDir, file), { name: file });
    }

    archive.finalize();
  });
}

/**
 * Upload a log archive to the controller.
 */
export async function uploadLogArchive(
  zipPath: string,
  serverUrl: string,
  token: string
): Promise<boolean> {
  try {
    const fileBuffer = fs.readFileSync(zipPath);
    const FormData = (await import('form-data')).default;
    const form = new FormData();
    form.append('file', fileBuffer, {
      filename: path.basename(zipPath),
      contentType: 'application/zip',
    });

    await axios.post(`${serverUrl}/api/client/logs/upload`, form, {
      headers: {
        Authorization: `Bearer ${token}`,
        ...form.getHeaders(),
      },
      maxBodyLength: 50 * 1024 * 1024,
      timeout: 30000,
    });

    logger.info('Log archive uploaded successfully');

    // Clean up zip file after upload
    fs.unlinkSync(zipPath);
    return true;
  } catch (error: any) {
    logger.error(`Log upload failed: ${error.message}`);
    // Clean up zip on failure too
    if (fs.existsSync(zipPath)) {
      fs.unlinkSync(zipPath);
    }
    return false;
  }
}
