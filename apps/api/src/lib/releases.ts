import { config } from '../config.js';
import { logger } from './core.js';

export interface ReleaseBuild { version: string; file: string; url: string; sizeMb: number; releasedAt: string }
export interface Releases { stable: ReleaseBuild | null; beta: ReleaseBuild | null }

interface GithubRelease {
  tag_name: string; draft: boolean; prerelease: boolean; published_at: string | null;
  assets: { name: string; size: number; browser_download_url: string }[];
}

const TTL_MS = 10 * 60_000;
let cache: { at: number; value: Releases } | null = null;

function toBuild(r: GithubRelease): ReleaseBuild | null {
  const exe = r.assets.find((a) => a.name.toLowerCase().endsWith('.exe'));
  if (!exe) return null;
  return {
    version: r.tag_name.replace(/^v/, ''), file: exe.name, url: exe.browser_download_url,
    sizeMb: Math.round((exe.size / 1_048_576) * 10) / 10, releasedAt: r.published_at ?? new Date(0).toISOString(),
  };
}

/** Picks the newest stable installer, and the newest test (pre-release) installer only when it is newer than that. */
export function pickReleases(list: GithubRelease[]): Releases {
  const published = list.filter((r) => !r.draft).sort((a, b) => (b.published_at ?? '').localeCompare(a.published_at ?? ''));
  const stableRelease = published.find((r) => !r.prerelease && toBuild(r));
  const betaRelease = published.find((r) => r.prerelease && toBuild(r));
  const stable = stableRelease ? toBuild(stableRelease) : null;
  const beta = betaRelease ? toBuild(betaRelease) : null;
  return { stable, beta: beta && (!stable || beta.releasedAt > stable.releasedAt) ? beta : null };
}

/**
 * Desktop installers published to GitHub Releases (DESKTOP_RELEASE_REPO, e.g. "owner/repo"), cached for 10 minutes.
 * A failed lookup keeps serving the last good answer.
 */
export async function desktopReleases(): Promise<Releases> {
  if (!config.DESKTOP_RELEASE_REPO) return { stable: null, beta: null };
  if (cache && Date.now() - cache.at < TTL_MS) return cache.value;
  try {
    const res = await fetch(`https://api.github.com/repos/${config.DESKTOP_RELEASE_REPO}/releases?per_page=20`, {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'dev102-api' },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) throw new Error(`GitHub answered ${res.status}`);
    cache = { at: Date.now(), value: pickReleases((await res.json()) as GithubRelease[]) };
  } catch (err) {
    logger.warn({ err: (err as Error).message }, 'desktop release lookup failed');
    if (!cache) return { stable: null, beta: null };
  }
  return cache.value;
}
