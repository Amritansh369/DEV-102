import type { DetectedApp, ProctorApi, ProctorEvent, ScreenShareResult, SystemReport, ViolationCode } from './types';

export type BlacklistedApp = DetectedApp;

/**
 * Browser fallback for the Electron preload bridge. Screens call getProctor()
 * and never need to know whether they run inside the desktop app.
 */
const violationListeners = new Set<(event: ProctorEvent) => void>();
const maximizeListeners = new Set<(maximized: boolean) => void>();
const screenEndListeners = new Set<() => void>();

let maximized = false;
let kioskActive = false;
let guardCleanup: (() => void) | null = null;
let screenStream: MediaStream | null = null;

let mockApps: DetectedApp[] = [
  { id: 'app-anydesk', name: 'AnyDesk', category: 'REMOTE', pid: 8124 },
  { id: 'app-obs', name: 'OBS Studio', category: 'RECORDER', pid: 5532 },
  { id: 'app-whatsapp', name: 'WhatsApp Desktop', category: 'MESSAGING', pid: 7710 },
];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

/** The entire-screen stream granted on the consent screen, used for periodic screen frames. */
export const getScreenStream = (): MediaStream | null => screenStream;

/** Used by the dev panel and the guards below to push an event through the same pipe as native events. */
export function emitMockEvent(code: ViolationCode, message?: string): void {
  const event: ProctorEvent = { code, message, at: new Date().toISOString() };
  violationListeners.forEach((listener) => listener(event));
}

function startGuards(): () => void {
  const last = new Map<ViolationCode, number>();
  const emitThrottled = (code: ViolationCode, message: string): void => {
    const now = Date.now();
    if (now - (last.get(code) ?? 0) < 4000) return;
    last.set(code, now);
    emitMockEvent(code, message);
  };

  const onBlur = (): void => emitThrottled('WINDOW_BLUR', 'The exam window lost focus.');
  const onVisibility = (): void => {
    if (document.visibilityState === 'hidden') emitThrottled('WINDOW_BLUR', 'The exam window was hidden.');
  };
  const onClipboard = (event: ClipboardEvent): void => {
    event.preventDefault();
    emitThrottled('CLIPBOARD_USE', 'Copy and paste are disabled during the exam.');
  };
  const onContext = (event: MouseEvent): void => event.preventDefault();
  const onKey = (event: KeyboardEvent): void => {
    const mod = event.ctrlKey || event.metaKey;
    const key = event.key.toLowerCase();
    const blocked =
      event.key === 'F12' ||
      event.key === 'PrintScreen' ||
      (mod && ['p', 's', 'u', 'f'].includes(key)) ||
      (mod && event.shiftKey && ['i', 'j', 'c'].includes(key));
    if (!blocked) return;
    event.preventDefault();
    emitThrottled('SHORTCUT_BLOCKED', `The shortcut ${event.ctrlKey ? 'Ctrl+' : ''}${event.key} is blocked.`);
  };

  window.addEventListener('blur', onBlur);
  document.addEventListener('visibilitychange', onVisibility);
  document.addEventListener('copy', onClipboard);
  document.addEventListener('cut', onClipboard);
  document.addEventListener('paste', onClipboard);
  document.addEventListener('contextmenu', onContext);
  document.addEventListener('keydown', onKey, true);
  return () => {
    window.removeEventListener('blur', onBlur);
    document.removeEventListener('visibilitychange', onVisibility);
    document.removeEventListener('copy', onClipboard);
    document.removeEventListener('cut', onClipboard);
    document.removeEventListener('paste', onClipboard);
    document.removeEventListener('contextmenu', onContext);
    document.removeEventListener('keydown', onKey, true);
  };
}

type DisplaySettings = MediaTrackSettings & { displaySurface?: string };

const mockProctor: ProctorApi = {
  native: false,
  window: {
    async minimize() {
      /* no-op in a browser tab */
    },
    async toggleMaximize() {
      maximized = !maximized;
      maximizeListeners.forEach((l) => l(maximized));
      return maximized;
    },
    async close() {
      try {
        window.close();
      } catch {
        /* browsers may refuse to close tabs they did not open */
      }
    },
    async isMaximized() {
      return maximized;
    },
    onMaximizeChange(cb) {
      maximizeListeners.add(cb);
      return () => {
        maximizeListeners.delete(cb);
      };
    },
  },
  system: {
    async scan(): Promise<SystemReport> {
      await sleep(1400);
      return {
        os: navigator.platform || 'Unknown OS',
        cameraOk: true,
        micLevel: 0.35 + Math.random() * 0.45,
        networkMbps: Math.round(18 + Math.random() * 42),
        latencyMs: Math.round(20 + Math.random() * 50),
        blacklistedApps: [...mockApps],
        displays: [
          { id: 'display-1', label: 'Built-in Display', width: window.screen.width, height: window.screen.height, primary: true, mirrored: false },
        ],
        vmDetected: false,
        remoteDesktop: false,
      };
    },
    async closeApps(ids) {
      await sleep(800);
      const closable = mockApps.filter((a) => ids.includes(a.id)).map((a) => a.id);
      mockApps = mockApps.filter((a) => !closable.includes(a.id));
      return closable;
    },
  },
  async listBlacklistedApps() {
    return [...mockApps];
  },
  async closeApp(pid: number) {
    mockApps = mockApps.filter((app) => app.pid !== pid);
  },
  async getDisplays() {
    return { count: 1, mirrored: false };
  },
  async detectVm() {
    return { vm: false, remote: false, detail: 'No virtual machine or remote session detected' };
  },
  enterKiosk() {
    return mockProctor.kiosk.enter();
  },
  exitKiosk() {
    return mockProctor.kiosk.exit();
  },
  onEvent(cb: (event: ProctorEvent) => void) {
    return mockProctor.events.onViolation(cb);
  },
  kiosk: {
    async enter() {
      if (kioskActive) return;
      kioskActive = true;
      guardCleanup = startGuards();
      try {
        await document.documentElement.requestFullscreen?.();
      } catch {
        /* fullscreen needs a user gesture in browsers; ignore */
      }
    },
    async exit() {
      kioskActive = false;
      guardCleanup?.();
      guardCleanup = null;
      try {
        if (document.fullscreenElement) await document.exitFullscreen();
      } catch {
        /* already left fullscreen */
      }
    },
    isActive() {
      return kioskActive;
    },
  },
  screen: {
    async requestEntireScreen(): Promise<ScreenShareResult> {
      const devices = navigator.mediaDevices;
      if (!devices || typeof devices.getDisplayMedia !== 'function') {
        await sleep(700);
        return { ok: true, surface: 'monitor', simulated: true };
      }
      try {
        const stream = await devices.getDisplayMedia({ video: true, audio: false });
        const track = stream.getVideoTracks()[0];
        const raw = (track?.getSettings() as DisplaySettings | undefined)?.displaySurface;
        const surface: ScreenShareResult['surface'] =
          raw === 'monitor' || raw === 'window' || raw === 'browser' ? raw : 'unknown';
        if (surface === 'window' || surface === 'browser') {
          stream.getTracks().forEach((t) => t.stop());
          return { ok: false, surface, reason: 'Please share your ENTIRE screen, not a window or a browser tab.' };
        }
        screenStream = stream;
        track?.addEventListener('ended', () => {
          screenStream = null;
          screenEndListeners.forEach((l) => l());
        });
        return { ok: true, surface };
      } catch {
        return { ok: false, surface: 'unknown', reason: 'Screen sharing was cancelled or blocked.' };
      }
    },
    async stop() {
      screenStream?.getTracks().forEach((t) => t.stop());
      screenStream = null;
    },
    onEnded(cb) {
      screenEndListeners.add(cb);
      return () => {
        screenEndListeners.delete(cb);
      };
    },
  },
  events: {
    onViolation(cb) {
      violationListeners.add(cb);
      return () => {
        violationListeners.delete(cb);
      };
    },
  },
};

let nativeProctor: ProctorApi | null = null;

/**
 * Returns the Electron bridge when present, otherwise the browser mock. Screen sharing always runs
 * in the renderer (getDisplayMedia); inside Electron the main process routes it to the entire screen.
 */
export function getProctor(): ProctorApi {
  const bridge = window.proctor;
  if (!bridge) return mockProctor;
  nativeProctor ??= {
    ...bridge,
    native: true,
    screen: mockProctor.screen,
    system: {
      scan: mockProctor.system.scan,
      closeApps: (ids) => bridge.system.closeApps(ids),
    },
  };
  return nativeProctor;
}
