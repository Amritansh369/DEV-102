import { BrowserWindow, globalShortcut, type Input } from 'electron';
import type { ProctorEvent } from '../../src/lib/types';

type Emit = (event: ProctorEvent) => void;

/** OS-level shortcuts we can intercept globally while the exam window is focused. */
const GLOBAL_BLOCK = ['PrintScreen', 'Alt+PrintScreen', 'CommandOrControl+PrintScreen', 'Super+PrintScreen', 'Super+Shift+S', 'Alt+Space', 'Super+D', 'Super+E', 'Super+R', 'Super+Tab', 'Super+V'];

function blockedLabel(input: Input): string | null {
  const key = input.key.toLowerCase();
  const mod = input.control || input.meta;
  if (input.key === 'F12' || input.key === 'F5' || input.key === 'F11') return input.key;
  if (mod && input.shift && ['i', 'j', 'c', 'k'].includes(key)) return `Ctrl+Shift+${input.key.toUpperCase()}`;
  if (mod && ['r', 'p', 's', 'u', 'w', 'n', 't', 'o', 'f', 'h', 'j', 'l', 'd', '+', '-', '=', '0'].includes(key)) return `Ctrl+${input.key.toUpperCase()}`;
  if (input.alt && (input.key === 'F4' || key === 'tab' || key === 'escape' || key === 'arrowleft' || key === 'arrowright')) return `Alt+${input.key}`;
  if (input.meta && !input.control) return 'Windows key';
  return null;
}

/**
 * Locks the exam window: fullscreen kiosk, always on top, excluded from screen capture, devtools
 * and context menu disabled, restricted shortcuts swallowed and reported, focus loss reported.
 * In development (PROCTOR_SOFT_KIOSK=1) the window is not locked so it can be debugged.
 */
export class Kiosk {
  active = false;
  private lastReport = new Map<string, number>();

  constructor(private readonly win: BrowserWindow, private readonly emit: Emit, private readonly soft: boolean) {
    win.webContents.on('before-input-event', (event, input) => {
      if (!this.active || input.type !== 'keyDown') return;
      const label = blockedLabel(input);
      if (!label) return;
      event.preventDefault();
      this.report('SHORTCUT_BLOCKED', `The shortcut ${label} is blocked during the exam`, label);
    });
    win.webContents.on('context-menu', (event) => this.active && event.preventDefault());
    win.webContents.on('devtools-opened', () => {
      if (this.active && !this.soft) win.webContents.closeDevTools();
    });
    win.on('blur', () => {
      if (!this.active) return;
      this.report('WINDOW_BLUR', 'The exam window lost focus', 'blur');
      if (!this.soft) setTimeout(() => !win.isDestroyed() && win.focus(), 150);
    });
    win.on('leave-full-screen', () => {
      if (this.active && !this.soft) win.setFullScreen(true);
    });
  }

  private report(code: ProctorEvent['code'], message: string, key: string): void {
    const now = Date.now();
    if (now - (this.lastReport.get(key) ?? 0) < 4000) return;
    this.lastReport.set(key, now);
    this.emit({ code, message, at: new Date().toISOString() });
  }

  enter(): void {
    if (this.active) return;
    this.active = true;
    this.win.setContentProtection(true);
    if (!this.soft) {
      this.win.setKiosk(true);
      this.win.setAlwaysOnTop(true, 'screen-saver');
      this.win.setFullScreen(true);
      this.win.setMinimizable(false);
      this.win.setClosable(false);
      this.win.webContents.closeDevTools();
    }
    for (const accel of GLOBAL_BLOCK) {
      try {
        globalShortcut.register(accel, () => this.report('SHORTCUT_BLOCKED', `The shortcut ${accel} is blocked during the exam`, accel));
      } catch {
        /* the OS owns some combinations; those are caught by blur detection instead */
      }
    }
  }

  exit(): void {
    if (!this.active) return;
    this.active = false;
    globalShortcut.unregisterAll();
    if (this.win.isDestroyed()) return;
    this.win.setContentProtection(false);
    this.win.setKiosk(false);
    this.win.setAlwaysOnTop(false);
    this.win.setFullScreen(false);
    this.win.setMinimizable(true);
    this.win.setClosable(true);
  }
}
