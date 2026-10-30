import { readFile, readdir, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { config } from '../config.js';
import { logger } from './core.js';
import { hmac, safeEqual } from './crypto.js';
import { prisma } from './db.js';

const URL_TTL_SEC = 15 * 60;
const MIMES: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

/** Short-lived HMAC-signed URL; the evidence route checks the signature before serving the file. */
export function signEvidenceUrl(evidenceId: string, now = Date.now()): string {
  // Round the expiry to the TTL window so URLs stay stable across polling refreshes (better caching).
  const exp = Math.ceil(now / 1000 / URL_TTL_SEC) * URL_TTL_SEC + URL_TTL_SEC;
  const sig = hmac(`${evidenceId}.${exp}`, config.JWT_SECRET);
  return `${config.PUBLIC_API_URL.replace(/\/$/, '')}/api/v1/evidence/${evidenceId}?exp=${exp}&sig=${sig}`;
}

/** Signed URL for a candidate's reference photo (used as their avatar in staff views). */
export function signPhotoUrl(candidateId: string, now = Date.now()): string {
  const exp = Math.ceil(now / 1000 / URL_TTL_SEC) * URL_TTL_SEC + URL_TTL_SEC;
  return `${config.PUBLIC_API_URL.replace(/\/$/, '')}/api/v1/photos/${candidateId}?exp=${exp}&sig=${hmac(`photo.${candidateId}.${exp}`, config.JWT_SECRET)}`;
}

export function verifyPhotoSignature(candidateId: string, exp: string, sig: string): boolean {
  const expNum = Number(exp);
  if (!Number.isFinite(expNum) || expNum * 1000 < Date.now()) return false;
  return safeEqual(sig, hmac(`photo.${candidateId}.${expNum}`, config.JWT_SECRET));
}

export function verifyEvidenceSignature(evidenceId: string, exp: string, sig: string): boolean {
  const expNum = Number(exp);
  if (!Number.isFinite(expNum) || expNum * 1000 < Date.now()) return false;
  return safeEqual(sig, hmac(`${evidenceId}.${expNum}`, config.JWT_SECRET));
}

export function decodeImage(dataUrlOrBase64: string): { buffer: Buffer; mime: string } | null {
  const m = dataUrlOrBase64.match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/);
  const mime = m?.[1] ?? 'image/jpeg';
  const buffer = Buffer.from(m?.[2] ?? dataUrlOrBase64, 'base64');
  // Check magic bytes so arbitrary files cannot be stored as "images".
  const isJpeg = buffer[0] === 0xff && buffer[1] === 0xd8;
  const isPng = buffer[0] === 0x89 && buffer[1] === 0x50;
  const isWebp = buffer.subarray(8, 12).toString('ascii') === 'WEBP';
  if (buffer.length < 100 || buffer.length > 3_000_000 || !(isJpeg || isPng || isWebp)) return null;
  return { buffer, mime: isPng ? 'image/png' : isWebp ? 'image/webp' : mime };
}

export async function saveEvidence(sessionId: string, kind: 'webcam' | 'screen', image: { buffer: Buffer; mime: string }): Promise<string> {
  const id = randomUUID().replace(/-/g, '');
  await prisma.evidence.create({ data: { id, sessionId, kind, path: `${id}.${MIMES[image.mime] ?? 'jpg'}`, mime: image.mime, data: new Uint8Array(image.buffer) } });
  return id;
}

/** Stores a reference face photo; returns the value kept in photoPath. */
export async function saveFacePhoto(ownerId: string, buffer: Buffer): Promise<string> {
  await prisma.facePhoto.upsert({ where: { ownerId }, create: { ownerId, data: new Uint8Array(buffer) }, update: { data: new Uint8Array(buffer) } });
  return `face_${ownerId}.jpg`;
}

/** A reference face photo: from the database, or the file of an older or seeded one. Null when it is gone. */
export async function readFacePhoto(ownerId: string, photoPath: string | null): Promise<Buffer | null> {
  if (!photoPath) return null;
  const row = await prisma.facePhoto.findUnique({ where: { ownerId }, select: { data: true } });
  return row ? Buffer.from(row.data) : readFile(evidencePath(photoPath)).catch(() => null);
}

export const evidencePath = (file: string): string => join(config.evidenceDir, file.replace(/[\\/]/g, ''));

/** Deletes evidence, frames and activity older than RETENTION_DAYS. */
export async function runRetention(): Promise<void> {
  const cutoff = new Date(Date.now() - config.RETENTION_DAYS * 86_400_000);
  const old = await prisma.evidence.findMany({ where: { createdAt: { lt: cutoff } }, select: { id: true, path: true } });
  for (const e of old) await rm(evidencePath(e.path), { force: true });
  const [ev, , act, otp] = await Promise.all([
    prisma.evidence.deleteMany({ where: { id: { in: old.map((e) => e.id) } } }),
    prisma.facePhoto.deleteMany({ where: { createdAt: { lt: cutoff } } }),
    prisma.activityLog.deleteMany({ where: { at: { lt: cutoff } } }),
    prisma.otpCode.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - 86_400_000) } } }),
  ]);
  // Orphan files (crash between write and insert) older than a day.
  try {
    const known = new Set((await prisma.evidence.findMany({ select: { path: true } })).map((e) => e.path));
    for (const f of await readdir(config.evidenceDir)) {
      if (known.has(f)) continue;
      const s = await stat(join(config.evidenceDir, f));
      if (Date.now() - s.mtimeMs > 86_400_000) await rm(join(config.evidenceDir, f), { force: true });
    }
  } catch {
    /* directory may not exist yet */
  }
  if (ev.count || act.count || otp.count) logger.info({ evidence: ev.count, activity: act.count, otp: otp.count }, 'retention cleanup');
}
