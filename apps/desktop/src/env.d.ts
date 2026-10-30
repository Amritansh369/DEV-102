/// <reference types="vite/client" />
import type { DetailedHTMLProps, HTMLAttributes } from 'react';

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
}

declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      /** Electron's isolated guest page, used for sandbox browser tabs. */
      webview: DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement> & { src?: string; partition?: string; allowpopups?: string; webpreferences?: string };
    }
  }
}

declare global {
  /** Set from package.json at build time (electron.vite.config.ts). */
  const __APP_VERSION__: string;
}
