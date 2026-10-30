import { BrowserWindow, desktopCapturer, ipcMain, type IpcMainInvokeEvent } from 'electron';
import type { ProctorEvent } from '../src/lib/types';
import { GuardMonitor, deviceFingerprint, windowTitles } from './security/guards';
import type { ExamWindow } from './security/exam-window';
import { storeDel, storeGet, storeSet } from './secure-store';
import { CH } from './channels';
import { isAppPage } from './trust';

export { CH };


const KEY_RE = /^[\w-]{1,64}$/;

export function registerIpc(getWin: () => BrowserWindow | null, getExam: () => ExamWindow | null, rendererBase: () => string): (e: ProctorEvent) => void {
  const emit = (e: ProctorEvent) => getWin()?.webContents.send(CH.evViolation, e);
  const guards = new GuardMonitor(emit);

  /** Only the exam window's own top frame may call the bridge (not injected frames). */
  const trusted = (event: IpcMainInvokeEvent): boolean => {
    const win = getWin();
    if (!win || event.sender.id !== win.webContents.id || !event.senderFrame) return false;
    return event.senderFrame.parent === null && isAppPage(event.senderFrame.url, rendererBase());
  };
  const handle = <A extends unknown[], R>(channel: string, fn: (...args: A) => R | Promise<R>) =>
    ipcMain.handle(channel, (event, ...args) => {
      if (!trusted(event)) throw new Error('Untrusted sender');
      return fn(...(args as A));
    });

  handle(CH.winMinimize, () => getWin()?.minimize());
  handle(CH.winToggleMax, () => {
    const w = getWin();
    if (!w) return false;
    if (w.isFullScreen() || w.isMaximized()) {
      w.setFullScreen(false);
      w.unmaximize();
    } else w.setFullScreen(true);
    return w.isFullScreen() || w.isMaximized();
  });
  handle(CH.winClose, async () => {
    // Outside an exam the window closes at once; during one the candidate is asked first.
    if (!(await (getExam()?.confirmClose() ?? Promise.resolve(true)))) return;
    getWin()?.close();
  });
  handle(CH.winIsMax, () => Boolean(getWin()?.isFullScreen() || getWin()?.isMaximized()));
  // Every display, not only the one being streamed, so a second monitor cannot hide anything.
  handle(CH.screensCapture, async () => {
    const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 1280, height: 720 } });
    return sources.filter((s) => !s.thumbnail.isEmpty()).map((s) => `data:image/jpeg;base64,${s.thumbnail.toJPEG(60).toString('base64')}`);
  });
  handle(CH.deviceId, () => deviceFingerprint());
  handle(CH.windowTitles, () => windowTitles());
  handle(CH.examStart, () => getExam()?.start());
  handle(CH.examStop, () => getExam()?.stop());
  handle(CH.guardsStart, () => guards.start());
  handle(CH.guardsStop, () => guards.stop());
  handle(CH.storeGet, (key: unknown) => (typeof key === 'string' && KEY_RE.test(key) ? storeGet(key) : null));
  handle(CH.storeSet, (key: unknown, value: unknown) => (typeof key === 'string' && KEY_RE.test(key) ? storeSet(key, value) : undefined));
  handle(CH.storeDel, (key: unknown) => (typeof key === 'string' && KEY_RE.test(key) ? storeDel(key) : undefined));

  return emit;
}
