import { app, dialog, type BrowserWindow } from 'electron';
import electronUpdater from 'electron-updater';

const { autoUpdater } = electronUpdater;
const EVERY_MS = 4 * 60 * 60_000;

/**
 * Keeps the installed app current from GitHub Releases (electron-builder.yml `publish`).
 * Updates download in the background. Outside an exam the app offers to restart into the new version right away;
 * during an exam it never interrupts, and the update installs when the app closes.
 * A beta build (version like 0.2.0-beta.1) also receives newer betas; a stable build only stable releases.
 */
export function startAutoUpdates(getWindow: () => BrowserWindow | null, inExam: () => boolean): void {
  if (!app.isPackaged || process.env.PROCTOR_NO_UPDATES === '1') return;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  let offered = '';
  autoUpdater.on('update-downloaded', (info) => {
    console.info(`Update ${info.version} downloaded.`);
    const win = getWindow();
    if (inExam() || !win || offered === info.version) return;
    offered = info.version;
    void dialog.showMessageBox(win, {
      type: 'info', buttons: ['Restart now', 'Later'], defaultId: 0, cancelId: 1, noLink: true,
      title: 'Update ready', message: `Version ${info.version} of Where U Elevate is ready.`,
      detail: 'Restart now to update, or choose Later and it installs the next time you close the app.',
    }).then(({ response }) => {
      // Re-check: an exam may have started while the dialog was open.
      if (response === 0 && !inExam()) autoUpdater.quitAndInstall(false, true);
    });
  });
  autoUpdater.on('error', (err) => console.warn('Update check failed:', err.message));
  const check = () => void autoUpdater.checkForUpdates().catch(() => undefined);
  check();
  setInterval(check, EVERY_MS).unref();
}
