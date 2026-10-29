import type { NextFunction, Request, RequestHandler, Response } from 'express';
import pino from 'pino';
import { ZodError, type ZodType, type z } from 'zod';
import { Prisma } from '@prisma/client';
import { config } from '../config.js';

export const logger = pino({
  level: config.isProd ? 'info' : 'debug',
  redact: {
    paths: ['req.headers.authorization', 'req.headers.cookie', '*.password', '*.passwordHash', '*.code', '*.token', '*.otp', '*.imageBase64'],
    censor: '[redacted]',
  },
  ...(config.isProd ? {} : { transport: undefined }),
});

export type ErrorCode = 'VALIDATION' | 'AUTH' | 'FORBIDDEN' | 'NOT_FOUND' | 'CONFLICT' | 'RATE_LIMITED' | 'LOCKED' | 'SERVER';

const STATUS: Record<ErrorCode, number> = {
  VALIDATION: 400, AUTH: 401, FORBIDDEN: 403, NOT_FOUND: 404, CONFLICT: 409, LOCKED: 423, RATE_LIMITED: 429, SERVER: 500,
};

export class AppError extends Error {
  constructor(readonly code: ErrorCode, message: string, readonly details?: unknown) {
    super(message);
    this.name = 'AppError';
  }
  get status(): number {
    return STATUS[this.code];
  }
}

export const fail = (code: ErrorCode, message: string, details?: unknown): never => {
  throw new AppError(code, message, details);
};

export function must<T>(value: T | null | undefined, what: string): T {
  if (value === null || value === undefined) throw new AppError('NOT_FOUND', `${what} was not found.`);
  return value;
}

export const ok = <T>(res: Response, data: T, status = 200): void => {
  res.status(status).json({ ok: true, data });
};

/** Wraps an async handler and sends its return value in the success envelope. */
export const handle =
  <T>(fn: (req: Request, res: Response) => Promise<T>): RequestHandler =>
  (req, res, next) => {
    fn(req, res)
      .then((data) => {
        if (!res.headersSent && !res.writableEnded) ok(res, data ?? null);
      })
      .catch(next);
  };

export function parse<S extends ZodType>(schema: S, value: unknown): z.infer<S> {
  const result = schema.safeParse(value);
  if (!result.success) {
    const first = result.error.issues[0];
    throw new AppError('VALIDATION', first ? `${first.path.join('.') || 'input'}: ${first.message}` : 'Invalid input', result.error.flatten());
  }
  return result.data;
}

export interface Page<T> { items: T[]; total: number; page: number; pageSize: number }
export function pageArgs(q: Record<string, unknown>): { page: number; pageSize: number; skip: number; take: number } {
  const page = Math.max(1, Number(q.page) || 1);
  const pageSize = Math.min(200, Math.max(1, Number(q.pageSize) || 10));
  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize };
}

export function errorMiddleware(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  let e: AppError;
  if (err instanceof AppError) e = err;
  else if (err instanceof ZodError) e = new AppError('VALIDATION', err.issues[0]?.message ?? 'Invalid input');
  else if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') e = new AppError('CONFLICT', 'A record with these details already exists.');
  else if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') e = new AppError('NOT_FOUND', 'The record was not found.');
  else if (err instanceof SyntaxError && 'body' in err) e = new AppError('VALIDATION', 'Malformed JSON body.');
  else if (err && typeof err === 'object' && 'type' in err && (err as { type: string }).type === 'entity.too.large') e = new AppError('VALIDATION', 'Request body is too large.');
  else {
    logger.error({ err, path: req.path, reqId: req.id }, 'Unhandled error');
    e = new AppError('SERVER', 'Something went wrong on our side. Please try again.');
  }
  res.status(e.status).json({ ok: false, error: { code: e.code, message: e.message, ...(e.details && !config.isProd ? { details: e.details } : {}) } });
}

declare module 'express-serve-static-core' {
  interface Request {
    id: string;
  }
}
