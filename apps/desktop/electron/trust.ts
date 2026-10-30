/**
 * Whether a page belongs to the app itself. `base` is the dev server origin (http://localhost:5173) or, in the
 * installed app, the file:// URL of the renderer folder. File URLs have an opaque origin ("null"), so they are
 * matched by path instead of by origin.
 */
export function isAppPage(url: string, base: string): boolean {
  if (base.startsWith('file:')) return url.startsWith(base);
  try {
    return new URL(url).origin === base;
  } catch {
    return false;
  }
}
