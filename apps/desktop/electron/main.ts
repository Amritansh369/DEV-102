import { app, BrowserWindow, desktopCapturer, session, shell } from 'electron';
import { join } from 'node:path';
import { CH, registerIpc } from './ipc';
import { Kiosk } from './security/kiosk';
import { setRelaxed } from './security/guards';
import { SANDBOX_PARTITION, attachGuard, hardenSandbox } from './browser-sandbox/sandbox';
import { startAutoUpdates } from './updater';

const PROTOCOL = 'dev102';
const AI_HOSTS = [
  'chatgpt.com', 'chat.openai.com', 'openai.com', 'gemini.google.com', 'bard.google.com', 'claude.ai', 'copilot.microsoft.com',
  'perplexity.ai', 'deepseek.com', 'chat.deepseek.com', 'poe.com', 'you.com', 'character.ai', 'grok.com', 'meta.ai', 'phind.com',
] as const;

const devUrl = process.env.ELECTRON_RENDERER_URL ?? process.env.DESKTOP_RENDERER_URL;
const isDev = !app.isPackaged;
// Development keeps the window debuggable unless PROCTOR_STRICT=1; packaged builds always lock down.
const softKiosk = isDev && process.env.PROCTOR_STRICT !== '1';
setRelaxed(softKiosk);
const rendererOrigin = () => (devUrl ? new URL(devUrl).origin : 'file://');

let win: BrowserWindow | null = null;
let kiosk: Kiosk | null = null;
let pendingDeepLink: string | null = null;
let appIsQuitting = false;

// Only one copy of the proctor may run; a second launch focuses the first (and forwards deep links).
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', (_e, argv) => {
    const link = argv.find((a) => a.startsWith(`${PROTOCOL}://`));
    if (link) deliverDeepLink(link);
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });
}

if (process.defaultApp && process.argv[1]) app.setAsDefaultProtocolClient(PROTOCOL, process.execPath, [process.argv[1]]);
else app.setAsDefaultProtocolClient(PROTOCOL);

function deliverDeepLink(url: string): void {
  if (!/^dev102:\/\/[\w/?=&.-]{0,300}$/.test(url)) return;
  if (win && !win.webContents.isLoading()) win.webContents.send(CH.evDeepLink, url);
  else pendingDeepLink = url;
}

const emit = registerIpc(() => win, () => kiosk, rendererOrigin);

function lockDownSession(): void {
  const ses = session.defaultSession;
  // Camera, microphone and screen capture only for the exam renderer itself.
  ses.setPermissionRequestHandler((wc, permission, cb) => {
    const ok = ['media', 'display-capture', 'fullscreen', 'clipboard-sanitized-write'].includes(permission);
    cb(ok && wc.id === win?.webContents.id);
  });
  ses.setPermissionCheckHandler((wc, permission) => ['media', 'display-capture', 'fullscreen'].includes(permission) && wc?.id === win?.webContents.id);
  // getDisplayMedia always receives the primary entire screen: windows or tabs cannot be picked.
  ses.setDisplayMediaRequestHandler(async (_req, cb) => {
    const sources = await desktopCapturer.getSources({ types: ['screen'] });
    const primary = sources.find((s) => s.display_id) ?? sources[0];
    if (!primary) return cb({});
    cb({ video: primary });
  }, { useSystemPicker: false });
  ses.on('will-download', (e) => e.preventDefault());
  hardenSandbox(AI_HOSTS);
}

async function createWindow(): Promise<void> {
  win = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 1100,
    minHeight: 700,
    show: false,
    frame: false,
    backgroundColor: '#0b1f4d',
    title: 'Where U Elevate · Smart Proctor',
    icon: join(app.getAppPath(), 'public', 'images', 'logo.png'),
    webPreferences: {
      preload: join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webviewTag: true,
      spellcheck: false,
      devTools: isDev,
      // Read by the preload as window.proctor.relaxed.
      additionalArguments: softKiosk ? ['--proctor-relaxed'] : [],
    },
  });
  kiosk = new Kiosk(win, emit, softKiosk);

  win.on('close', (event) => {
    if (!kiosk?.active || appIsQuitting) return;
    // A close from the OS (taskbar, Alt+F4) during an exam gets the same warning as the title bar's button.
    event.preventDefault();
    void kiosk.confirmClose().then((close) => { if (close) win?.close(); });
  });
  // The exam page blocks unloading while it runs; once kiosk mode is off (no exam, or closing was confirmed) let it go.
  win.webContents.on('will-prevent-unload', (event) => {
    if (!kiosk?.active) event.preventDefault();
  });
  // Opens full screen; the title bar's maximise button leaves and re-enters it.
  win.once('ready-to-show', () => {
    win?.setFullScreen(true);
    win?.show();
  });
  for (const ev of ['maximize', 'unmaximize', 'enter-full-screen', 'leave-full-screen'] as const) {
    win.on(ev as 'maximize', () => win?.webContents.send(CH.evMaximize, Boolean(win?.isFullScreen() || win?.isMaximized())));
  }
  win.on('closed', () => {
    win = null;
    kiosk = null;
  });
  win.webContents.on('did-finish-load', () => {
    if (pendingDeepLink) deliverDeepLink(pendingDeepLink);
    pendingDeepLink = null;
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\/(www\.)?whereuelevate\.com\//.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith(rendererOrigin())) e.preventDefault();
  });
  attachGuard(win.webContents, AI_HOSTS);

  try {
    if (devUrl) await win.loadURL(devUrl);
    else await win.loadFile(join(__dirname, '../renderer/index.html'));
  } catch (error) {
    console.error('Could not load the desktop renderer:', error);
  }
}

app.on('open-url', (e, url) => {
  e.preventDefault();
  deliverDeepLink(url);
});

app.whenReady().then(() => {
  lockDownSession();
  const link = process.argv.find((a) => a.startsWith(`${PROTOCOL}://`));
  if (link) pendingDeepLink = link;
  void createWindow();
  startAutoUpdates(() => win, () => Boolean(kiosk?.active));
});

app.on('web-contents-created', (_e, contents) => {
  // Defence in depth: no web contents (including sandbox tabs) may open new native windows.
  contents.setWindowOpenHandler(() => ({ action: 'deny' }));
  if (contents.getType() === 'webview' && contents.session !== session.fromPartition(SANDBOX_PARTITION)) contents.close();
});

app.on('window-all-closed', () => {
  kiosk?.exit();
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  appIsQuitting = true;
  kiosk?.exit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) void createWindow();
});
