import { BrowserWindow, dialog } from 'electron';
import type { ProctorEvent } from '../../src/lib/types';

type Emit = (event: ProctorEvent) => void;

/**
 * Watches the exam window while an exam runs. Nothing is locked or blocked: the candidate can switch
 * apps and use anything, and every time they leave the window the proctor is told.
 */
export class ExamWindow {
  active = false;
  private leftAt: number | null = null;

  constructor(private readonly win: BrowserWindow, private readonly emit: Emit) {
    win.on('blur', () => {
      if (!this.active) return;
      this.leftAt = Date.now();
      this.emit({ code: 'WINDOW_BLUR', message: 'The candidate left the exam window.', at: new Date().toISOString() });
    });
    win.on('focus', () => {
      if (!this.active || this.leftAt === null) return;
      const seconds = Math.round((Date.now() - this.leftAt) / 1000);
      this.leftAt = null;
      if (seconds >= 2) this.emit({ code: 'WINDOW_BLUR', message: `The candidate came back to the exam window after ${seconds} seconds.`, at: new Date().toISOString() });
    });
  }

  start(): void {
    this.active = true;
  }

  stop(): void {
    this.active = false;
    this.leftAt = null;
  }

  /** Closing during an exam asks once, then reports it to the proctor. Returns whether the candidate chose to close. */
  async confirmClose(): Promise<boolean> {
    if (!this.active) return true;
    const { response } = await dialog.showMessageBox(this.win, {
      type: 'question', buttons: ['Stay in exam', 'Close app'], defaultId: 0, cancelId: 0, noLink: true,
      title: 'Exam in progress',
      message: 'Close the app during your exam?',
      detail: 'The exam timer keeps running. You can reopen the app and continue while time remains.',
    });
    if (response !== 1) return false;
    this.emit({ code: 'WINDOW_BLUR', message: 'The candidate closed the exam app during the exam.', at: new Date().toISOString() });
    // Give the renderer a moment to send the report before the window goes away.
    await new Promise((r) => setTimeout(r, 400));
    this.stop();
    return true;
  }
}
