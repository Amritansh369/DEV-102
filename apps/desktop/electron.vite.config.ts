import { resolve } from "node:path";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

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
          preload: resolve(__dirname, "electron/preload.ts"),
          tracker: resolve(__dirname, "electron/browser-sandbox/tracker.ts")
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
    plugins: [react(), tailwindcss()]
  }
});
