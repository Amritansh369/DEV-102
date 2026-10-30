import { app } from 'electron';
import electronUpdater from 'electron-updater';

const { autoUpdater } = electronUpdater;
const EVERY_MS = 4 * 60 * 60_000;

/**
 * Keeps the installed app current from GitHub Releases (electron-builder.yml `publish`).
 * Updates download in the background and install when the app quits, never during an exam.
 * A beta build (version like 0.2.0-beta.1) also receives newer betas; a stable build only stable releases.
 */
export function startAutoUpdates(): void {
  if (!app.isPackaged || process.env.PROCTOR_NO_UPDATES === '1') return;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on('update-downloaded', (info) => console.info(`Update ${info.version} downloaded; it installs when the app closes.`));
  autoUpdater.on('error', (err) => console.warn('Update check failed:', err.message));
  const check = () => void autoUpdater.checkForUpdates().catch(() => undefined);
  check();
  setInterval(check, EVERY_MS).unref();
}
