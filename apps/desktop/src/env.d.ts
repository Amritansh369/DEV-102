/// <reference types="vite/client" />
export {};

declare global {
  interface ImportMetaEnv {
    readonly VITE_API_URL?: string;
  }

  /** Set from package.json at build time (electron.vite.config.ts). */
  const __APP_VERSION__: string;
}
