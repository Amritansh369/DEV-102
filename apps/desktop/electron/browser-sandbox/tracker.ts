/** Preload injected into every exam browser tab: reports typing and AI answers to the exam window, which logs them to the proctor. */
import { ipcRenderer } from 'electron';
import { trackPage } from './page-tracker';

trackPage({
  typed: (text, trigger) => ipcRenderer.sendToHost('sandbox:typed', { text, trigger, url: location.href, title: document.title }),
  reply: (prompt, text) => ipcRenderer.sendToHost('sandbox:reply', { prompt, text, url: location.href, title: document.title }),
});
