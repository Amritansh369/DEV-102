// Builds the unpacked extension into dist/. API_URL (default http://localhost:4000) is baked into the
// scripts and the manifest's host permission. Load dist/ from chrome://extensions with Developer mode on.
import { build } from 'esbuild';
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, 'dist');
const api = (process.env.API_URL ?? 'http://localhost:4000').replace(/\/$/, '');

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

await build({
  entryPoints: { background: 'src/background.ts', content: 'src/content.ts', exam: 'src/exam.ts' },
  absWorkingDir: here,
  outdir: out,
  bundle: true,
  format: 'esm',
  target: 'chrome120',
  define: { __API_URL__: JSON.stringify(api) },
  logLevel: 'warning',
});

const manifest = readFileSync(join(here, 'manifest.json'), 'utf8').replaceAll('__API__', api);
writeFileSync(join(out, 'manifest.json'), manifest);
for (const f of ['exam.html', 'exam.css']) copyFileSync(join(here, 'static', f), join(out, f));
copyFileSync(join(here, '..', 'desktop', 'public', 'images', 'logo.png'), join(out, 'icon.png'));
console.log(`Built apps/extension/dist for ${api}`);
