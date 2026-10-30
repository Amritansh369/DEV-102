// Builds the Chrome extension against the production API, zips it and attaches the zip to the newest GitHub
// release, where the website's /download page picks it up. Bump "version" in apps/extension/manifest.json first.
//
//   API_URL=https://<api> npm run release:extension
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const extension = join(root, 'apps', 'extension');
const { version } = JSON.parse(readFileSync(join(extension, 'manifest.json'), 'utf8'));
const api = process.env.API_URL ?? '';

if (!/^https:\/\//.test(api)) {
  console.error('Set API_URL to the production API (https://...), which the extension is built against.');
  process.exit(1);
}
const run = (cmd, args, cwd = root) => {
  const r = spawnSync(cmd, args, { cwd, env: process.env, stdio: 'inherit', shell: process.platform === 'win32' });
  if (r.status !== 0) process.exit(r.status ?? 1);
};

run('npm', ['run', 'build', '-w', 'apps/extension']);
const zip = join(mkdtempSync(join(tmpdir(), 'dev102-extension-')), `Where-U-Elevate-Extension-${version}.zip`);
// Windows' own tar writes zips (-a picks the format from the file name). Git Bash's tar comes first on PATH there and cannot.
const tar = process.platform === 'win32' ? join(process.env.SystemRoot ?? 'C:\Windows', 'System32', 'tar.exe') : 'tar';
run(tar, ['-a', '-c', '-f', zip, '-C', join(extension, 'dist'), '.']);
const tag = execFileSync('gh', ['release', 'view', '--json', 'tagName', '--jq', '.tagName'], { encoding: 'utf8' }).trim();
run('gh', ['release', 'upload', tag, zip, '--clobber']);
console.log(`[release] Attached the extension ${version} to ${tag}. The website shows it within 10 minutes.`);
