import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import type { NativeBridge, ProctorEvent } from '../src/lib/types';
import { CH } from './channels';

const invoke = <T>(channel: string, ...args: unknown[]) => ipcRenderer.invoke(channel, ...args) as Promise<T>;

function listen<T>(channel: string, cb: (payload: T) => void): () => void {
  const fn = (_e: IpcRendererEvent, payload: T) => cb(payload);
  ipcRenderer.on(channel, fn);
  return () => ipcRenderer.removeListener(channel, fn);
}

const bridge: NativeBridge = {
  native: true,
  relaxed: process.argv.includes('--proctor-relaxed'),
  deviceId: () => invoke<string>(CH.deviceId),
  window: {
    minimize: () => invoke(CH.winMinimize),
    toggleMaximize: () => invoke<boolean>(CH.winToggleMax),
    close: () => invoke(CH.winClose),
    isMaximized: () => invoke<boolean>(CH.winIsMax),
    onMaximizeChange: (cb) => listen<boolean>(CH.evMaximize, cb),
  },
  windowTitles: () => invoke<{ app: string; title: string }[]>(CH.windowTitles),
  captureScreens: () => invoke<string[]>(CH.screensCapture),
  onEvent: (cb) => listen<ProctorEvent>(CH.evViolation, cb),
  exam: { start: () => invoke(CH.examStart), stop: () => invoke(CH.examStop) },
  events: { onViolation: (cb) => listen<ProctorEvent>(CH.evViolation, cb) },
  guards: { start: () => invoke(CH.guardsStart), stop: () => invoke(CH.guardsStop) },
  store: {
    get: <T>(key: string) => invoke<T | null>(CH.storeGet, key),
    set: (key, value) => invoke(CH.storeSet, key, value),
    del: (key) => invoke(CH.storeDel, key),
  },
  onDeepLink: (cb) => listen<string>(CH.evDeepLink, cb),
};

contextBridge.exposeInMainWorld('proctor', bridge);
