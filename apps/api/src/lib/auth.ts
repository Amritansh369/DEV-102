import type { NextFunction, Request, RequestHandler, Response } from 'express';
import jwt, { type SignOptions } from 'jsonwebtoken';
import type { Prisma, Role } from '@prisma/client';
import { config } from '../config.js';
import { AppError, logger } from './core.js';
import { prisma } from './db.js';

export interface AuthClaims {
  sub: string;
  role: Role;
  tv: number;
  examId?: string;
  deviceId?: string;
}

export function signToken(claims: AuthClaims): string {
  return jwt.sign(claims, config.JWT_SECRET, { algorithm: 'HS256', expiresIn: config.JWT_EXPIRES_IN as SignOptions['expiresIn'] });
}

export function verifyToken(token: string): AuthClaims {
  try {
    return jwt.verify(token, config.JWT_SECRET, { algorithms: ['HS256'] }) as AuthClaims;
  } catch {
    throw new AppError('AUTH', 'Your session has expired. Please sign in again.');
  }
}

/** Confirms the token has not been revoked by a logout, password reset or a newer login. */
export async function assertCurrent(claims: AuthClaims): Promise<void> {
  const row = claims.role === 'CANDIDATE'
    ? await prisma.candidate.findUnique({ where: { id: claims.sub }, select: { tokenVersion: true } })
    : await prisma.user.findFirst({ where: { id: claims.sub, deletedAt: null }, select: { tokenVersion: true } });
  if (!row || row.tokenVersion !== claims.tv) {
    throw new AppError('AUTH', claims.role === 'CANDIDATE' ? 'You were signed out because this account signed in again elsewhere.' : 'Your session is no longer valid. Please sign in again.');
  }
}

export const authenticate: RequestHandler = (req, _res, next) => {
  const header = req.headers.authorization ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) return next(new AppError('AUTH', 'Sign in to continue.'));
  let claims: AuthClaims;
  try {
    claims = verifyToken(token);
  } catch (e) {
    return next(e);
  }
  assertCurrent(claims)
    .then(() => {
      req.auth = claims;
      next();
    })
    .catch(next);
};

export const requireRole =
  (...roles: Role[]): RequestHandler =>
  (req, _res, next) => {
    if (!req.auth) return next(new AppError('AUTH', 'Sign in to continue.'));
    if (!roles.includes(req.auth.role)) return next(new AppError('FORBIDDEN', 'You do not have access to this action.'));
    next();
  };

export const staff = [authenticate, requireRole('ADMIN', 'MENTOR')];
export const adminOnly = [authenticate, requireRole('ADMIN')];
export const candidateOnly = [authenticate, requireRole('CANDIDATE')];

export function auth(req: Request): AuthClaims {
  if (!req.auth) throw new AppError('AUTH', 'Sign in to continue.');
  return req.auth;
}

/** Writes an audit row for staff actions. Never throws: auditing must not break the request. */
export function audit(req: Request, action: string, target?: string, meta?: Prisma.InputJsonValue): void {
  const a = req.auth;
  prisma.auditLog
    .create({
      data: {
        actorId: a && a.role !== 'CANDIDATE' ? a.sub : null,
        actorRole: a?.role ?? null,
        action, target: target ?? null, meta: meta ?? undefined,
        ip: req.ip ?? null,
      },
    })
    .catch((err: unknown) => logger.warn({ err, action }, 'audit write failed'));
}

export const noStore = (_req: Request, res: Response, next: NextFunction): void => {
  res.setHeader('Cache-Control', 'no-store');
  next();
};

declare module 'express-serve-static-core' {
  interface Request {
    auth?: AuthClaims;
  }
}
