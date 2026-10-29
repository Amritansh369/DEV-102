import { session, type WebContents } from 'electron';
import { join } from 'node:path';

export const SANDBOX_PARTITION = 'sandbox-exam';
const SEARCH_ENGINES = ['google.com', 'bing.com', 'duckduckgo.com'];

let allowed: string[] = [];

const norm = (h: string) => h.toLowerCase().replace(/^www\./, '');
const matches = (host: string, domain: string) => host === domain || host.endsWith(`.${domain}`);

/** AI sites stay reachable on purpose: the brief asks to allow them but record everything typed there. */
export function urlPermitted(raw: string, aiHosts: readonly string[]): boolean {
  try {
    const u = new URL(raw);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return false;
    const host = norm(u.hostname);
    return [...allowed, ...SEARCH_ENGINES, ...aiHosts].some((d) => matches(host, norm(d)));
  } catch {
    return false;
  }
}

export function setPolicy(sites: string[]): void {
  allowed = sites.map(norm).filter(Boolean).slice(0, 50);
}

/**
 * Hardens the isolated session used by sandbox tabs: no downloads, no permissions (camera, mic,
 * notifications, clipboard), no pop-up windows, a fresh cache per run, and our tracker preload.
 */
export function hardenSandbox(aiHosts: readonly string[]): void {
  const ses = session.fromPartition(SANDBOX_PARTITION);
  ses.setPermissionRequestHandler((_wc, _permission, cb) => cb(false));
  ses.setPermissionCheckHandler(() => false);
  ses.on('will-download', (event) => event.preventDefault());
  ses.webRequest.onBeforeRequest({ urls: ['<all_urls>'] }, (details, cb) => {
    // Sub-resources (CDNs, fonts) load freely; only top-level and frame navigations are policed.
    if (details.resourceType !== 'mainFrame' && details.resourceType !== 'subFrame') return cb({});
    cb({ cancel: !urlPermitted(details.url, aiHosts) });
  });
  void ses.clearStorageData();
}

export const trackerPath = (): string => join(__dirname, '../preload/tracker.js');

/** Applied from the host window's will-attach-webview: forces safe webPreferences on every tab. */
export function attachGuard(contents: WebContents, aiHosts: readonly string[]): void {
  contents.on('will-attach-webview', (event, prefs, params) => {
    if (params.partition !== SANDBOX_PARTITION || !urlPermitted(params.src || 'https://www.google.com', aiHosts)) {
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
      if (urlPermitted(url, aiHosts)) void wc.loadURL(url);
      return { action: 'deny' };
    });
    wc.on('context-menu', (e) => e.preventDefault());
  });
}
