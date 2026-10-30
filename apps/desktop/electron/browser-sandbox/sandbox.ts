import { session, type WebContents } from 'electron';
import { join } from 'node:path';

export const SANDBOX_PARTITION = 'sandbox-exam';

/** Any website opens: candidates may use what they like and everything is reported to the proctor. */
export function urlPermitted(raw: string): boolean {
  try {
    const { protocol } = new URL(raw);
    return protocol === 'https:' || protocol === 'http:';
  } catch {
    return false;
  }
}

/**
 * Hardens the isolated session used by sandbox tabs: no downloads, no permissions (camera, mic,
 * notifications), no local pages, no pop-up windows, a fresh cache per run, and our tracker preload.
 */
export function hardenSandbox(): void {
  const ses = session.fromPartition(SANDBOX_PARTITION);
  ses.setPermissionRequestHandler((_wc, _permission, cb) => cb(false));
  ses.setPermissionCheckHandler(() => false);
  ses.on('will-download', (event) => event.preventDefault());
  ses.webRequest.onBeforeRequest({ urls: ['<all_urls>'] }, (details, cb) => {
    // Sub-resources (CDNs, fonts) load freely; only top-level and frame navigations are policed.
    if (details.resourceType !== 'mainFrame' && details.resourceType !== 'subFrame') return cb({});
    cb({ cancel: !urlPermitted(details.url) });
  });
  void ses.clearStorageData();
}

export const trackerPath = (): string => join(__dirname, '../preload/tracker.js');

/** Applied from the host window's will-attach-webview: forces safe webPreferences on every tab. */
export function attachGuard(contents: WebContents): void {
  contents.on('will-attach-webview', (event, prefs, params) => {
    if (params.partition !== SANDBOX_PARTITION || !urlPermitted(params.src || 'https://www.google.com')) {
      event.preventDefault();
      return;
    }
    delete (prefs as { preloadURL?: string }).preloadURL;
    prefs.preload = trackerPath();
    prefs.nodeIntegration = false;
    prefs.nodeIntegrationInSubFrames = false;
    prefs.contextIsolation = true;
    prefs.sandbox = true;
    prefs.webSecurity = true;
    prefs.allowRunningInsecureContent = false;
  });
  contents.on('did-attach-webview', (_e, wc) => {
    wc.setWindowOpenHandler(({ url }) => {
      // Pop-ups open in the same tab instead of a new window the proctor cannot see.
      if (urlPermitted(url)) void wc.loadURL(url);
      return { action: 'deny' };
    });
  });
}
