import { afterEach, describe, expect, it, vi } from 'vitest';
import { pickReleases } from '../src/lib/releases.js';

const rel = (tag: string, at: string, opts: { prerelease?: boolean; draft?: boolean; exe?: boolean } = {}) => ({
  tag_name: tag, draft: opts.draft ?? false, prerelease: opts.prerelease ?? false, published_at: at,
  assets: opts.exe === false ? [{ name: 'latest.yml', size: 300, browser_download_url: 'https://x/latest.yml' }]
    : [{ name: `Where-U-Elevate-Setup-${tag.slice(1)}.exe`, size: 94 * 1_048_576, browser_download_url: `https://github.com/o/r/releases/download/${tag}/setup.exe` }],
});

describe('pickReleases', () => {
  it('finds the extension zip on the newest release that has one', () => {
    const zip = { name: 'Where-U-Elevate-Extension-0.2.0.zip', size: 1_048_576, browser_download_url: 'https://x/ext.zip' };
    const older = rel('v0.1.0', '2026-10-01T00:00:00Z');
    const r = pickReleases([rel('v0.2.0', '2026-10-10T00:00:00Z'), { ...older, assets: [...older.assets, zip] }]);
    expect(r.extension).toMatchObject({ version: '0.2.0', sizeMb: 1, url: 'https://x/ext.zip' });
  });

  it('returns the newest stable installer and a newer pre-release as the beta', () => {
    const r = pickReleases([
      rel('v0.1.0', '2026-10-01T00:00:00Z'),
      rel('v0.3.0-beta.1', '2026-10-20T00:00:00Z', { prerelease: true }),
      rel('v0.2.0', '2026-10-10T00:00:00Z'),
      rel('v0.4.0', '2026-10-25T00:00:00Z', { draft: true }),
    ]);
    expect(r.stable).toMatchObject({ version: '0.2.0', sizeMb: 94, file: 'Where-U-Elevate-Setup-0.2.0.exe' });
    expect(r.beta).toMatchObject({ version: '0.3.0-beta.1' });
  });

  it('hides a beta that is older than the newest stable release', () => {
    const r = pickReleases([rel('v0.2.0-beta.1', '2026-10-05T00:00:00Z', { prerelease: true }), rel('v0.2.0', '2026-10-10T00:00:00Z')]);
    expect(r.beta).toBeNull();
  });

  it('skips releases without an installer', () => {
    const r = pickReleases([rel('v0.2.0', '2026-10-10T00:00:00Z', { exe: false }), rel('v0.1.0', '2026-10-01T00:00:00Z')]);
    expect(r.stable?.version).toBe('0.1.0');
  });

  it('is empty when nothing is published', () => {
    expect(pickReleases([])).toEqual({ stable: null, beta: null, extension: null });
  });
});

describe('desktopReleases', () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.resetModules(); });

  it('asks GitHub once per cache window and keeps the last answer when GitHub fails', async () => {
    vi.stubEnv('DESKTOP_RELEASE_REPO', 'Amritansh369/DEV-102');
    vi.resetModules();
    const fetchMock = vi.fn(async () => new Response(JSON.stringify([rel('v0.2.0', '2026-10-10T00:00:00Z')]), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const { desktopReleases } = await import('../src/lib/releases.js');
    expect((await desktopReleases()).stable?.version).toBe('0.2.0');
    expect((await desktopReleases()).stable?.version).toBe('0.2.0');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith('https://api.github.com/repos/Amritansh369/DEV-102/releases?per_page=20', expect.anything());
  });

  it('is empty when no release repo is configured', async () => {
    vi.stubEnv('DESKTOP_RELEASE_REPO', '');
    vi.resetModules();
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { desktopReleases } = await import('../src/lib/releases.js');
    expect(await desktopReleases()).toEqual({ stable: null, beta: null, extension: null });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
