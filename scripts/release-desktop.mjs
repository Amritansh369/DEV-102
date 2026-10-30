// Builds the Windows installer against the production API and publishes it to GitHub Releases,
// where installed apps pick it up as an update. A version like 0.2.0-beta.1 goes out as a pre-release
// (the test channel); 0.2.0 as a normal release. Bump "version" in apps/desktop/package.json first.
//
//   VITE_API_URL=https://<api> npm run release:desktop
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const desktop = join(dirname(fileURLToPath(import.meta.url)), '..', 'apps', 'desktop');
const { version } = JSON.parse(readFileSync(join(desktop, 'package.json'), 'utf8'));
const api = process.env.VITE_API_URL ?? '';

if (!/^https:\/\//.test(api)) {
  console.error('Set VITE_API_URL to the production API (https://...), which the installer is built against.');
  process.exit(1);
}
let token = process.env.GH_TOKEN ?? '';
if (!token) {
  try {
    token = execFileSync('gh', ['auth', 'token'], { encoding: 'utf8' }).trim();
  } catch {
    console.error('Set GH_TOKEN, or sign in with "gh auth login", so the installer can be uploaded.');
    process.exit(1);
  }
}

const beta = version.includes('-');
console.log(`[release] ${version} as a ${beta ? 'pre-release (test channel)' : 'release'} against ${api}`);
const env = { ...process.env, VITE_API_URL: api, GH_TOKEN: token };
const run = (args) => {
  const r = spawnSync('npx', args, { cwd: desktop, env, stdio: 'inherit', shell: process.platform === 'win32' });
  if (r.status !== 0) process.exit(r.status ?? 1);
};
run(['electron-vite', 'build']);
// Create the release (and its tag on main) first: electron-builder uploads several files in parallel, and when the
// release does not exist yet they race to create it and some uploads fail with "Published releases must have a valid tag".
const tag = `v${version}`;
const exists = spawnSync('gh', ['release', 'view', tag], { stdio: 'ignore', env }).status === 0;
if (!exists) {
  const r = spawnSync('gh', ['release', 'create', tag, '--target', 'main', '--title', tag, '--notes', `Where U Elevate desktop app ${version}.`, ...(beta ? ['--prerelease'] : [])], { stdio: 'inherit', env });
  if (r.status !== 0) process.exit(r.status ?? 1);
}
// Build outside the project in a fresh folder: Windows (Defender, indexing) often locks files under apps/desktop
// while electron-builder renames them, which fails the build with EBUSY.
const output = join(tmpdir(), `dev102-release-${version}-${Date.now()}`);
run(['electron-builder', '--publish', 'always', `--config.publish.releaseType=${beta ? 'prerelease' : 'release'}`, `--config.directories.output=${output}`]);
console.log(`[release] Published v${version}. Installed apps update on their next start or within 4 hours.`);
