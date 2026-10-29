import { app, safeStorage } from 'electron';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * Small encrypted key-value store for the offline queue and cached answers. Values are encrypted
 * with the OS keychain (DPAPI on Windows) through safeStorage and written atomically.
 */
const dir = () => join(app.getPath('userData'), 'secure');
const file = (key: string) => join(dir(), `${key.replace(/[^\w-]/g, '_').slice(0, 64)}.bin`);

export async function storeGet(key: string): Promise<unknown> {
  try {
    const buf = await readFile(file(key));
    const text = safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(buf) : buf.toString('utf8');
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

export async function storeSet(key: string, value: unknown): Promise<void> {
  await mkdir(dir(), { recursive: true });
  const text = JSON.stringify(value);
  if (text.length > 20_000_000) throw new Error('Value too large for the secure store');
  const data = safeStorage.isEncryptionAvailable() ? safeStorage.encryptString(text) : Buffer.from(text, 'utf8');
  const tmp = `${file(key)}.tmp`;
  await writeFile(tmp, data, { mode: 0o600 });
  await rename(tmp, file(key));
}

export async function storeDel(key: string): Promise<void> {
  await rm(file(key), { force: true });
}
