import type { ProctorApi, ProctorEvent, ScreenShareResult, ViolationCode } from './types';

/**
 * Browser fallback for the Electron preload bridge. Screens call getProctor()
 * and never need to know whether they run inside the desktop app.
 */
const violationListeners = new Set<(event: ProctorEvent) => void>();
const maximizeListeners = new Set<(maximized: boolean) => void>();
const screenEndListeners = new Set<() => void>();

let maximized = false;
let guardCleanup: (() => void) | null = null;
let screenStream: MediaStream | null = null;

/** The entire-screen stream granted on the consent screen, used for the live view and screenshots. */
export const getScreenStream = (): MediaStream | null => screenStream;

/** Keeps the stream for the whole exam. If it ever ends the proctor is told, and it restarts without troubling the candidate. */
export function setScreenStream(stream: MediaStream): void {
  screenStream = stream;
  stream.getVideoTracks()[0]?.addEventListener('ended', () => {
    if (screenStream !== stream) return;
    screenStream = null;
    screenEndListeners.forEach((l) => l());
    void navigator.mediaDevices?.getDisplayMedia({ video: true, audio: false }).then(setScreenStream).catch(() => undefined);
  });
}

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
  window.addEventListener('blur', onBlur);
  document.addEventListener('visibilitychange', onVisibility);
  return () => {
    window.removeEventListener('blur', onBlur);
    document.removeEventListener('visibilitychange', onVisibility);
  };
}

type DisplaySettings = MediaTrackSettings & { displaySurface?: string };

const mockProctor: ProctorApi = {
  native: false,
  // The browser preview has no native guards at all.
  relaxed: true,
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
  onEvent(cb: (event: ProctorEvent) => void) {
    return mockProctor.events.onViolation(cb);
  },
  exam: {
    async start() {
      guardCleanup ??= startGuards();
    },
    async stop() {
      guardCleanup?.();
      guardCleanup = null;
    },
  },
  screen: {
    async requestEntireScreen(): Promise<ScreenShareResult> {
      const devices = navigator.mediaDevices;
      if (!devices || typeof devices.getDisplayMedia !== 'function') {
        await new Promise((resolve) => window.setTimeout(resolve, 700));
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
        setScreenStream(stream);
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
  };
  return nativeProctor;
}
