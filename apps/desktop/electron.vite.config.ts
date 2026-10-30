import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const { version } = JSON.parse(readFileSync(resolve(__dirname, "package.json"), "utf8")) as { version: string };

export default defineConfig({
  main: {
    build: {
      lib: {
        entry: "electron/main.ts"
      }
    },
    plugins: [externalizeDepsPlugin()]
  },
  preload: {
    build: {
      rollupOptions: {
        input: {
          preload: resolve(__dirname, "electron/preload.ts")
        }
      }
    },
    plugins: [externalizeDepsPlugin()]
  },
  renderer: {
    root: ".",
    server: { port: 5173, strictPort: true },
    build: {
      rollupOptions: {
        input: "index.html"
      }
    },
    // The version shown in the status bar comes from package.json, so it always matches the installed build.
    define: { __APP_VERSION__: JSON.stringify(version) },
    plugins: [react(), tailwindcss()]
  }
});
