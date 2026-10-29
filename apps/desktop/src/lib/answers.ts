import type { Question } from './types';

/**
 * A typed numeric answer as a number, or null when it is not one yet. Accepts digits, one decimal point and a
 * leading minus sign: "3." reads as 3 and ".5" as 0.5, while "-", "." and "1e5" count as unanswered.
 */
export function toNumber(raw: string | undefined): number | null {
  const t = (raw ?? '').trim();
  if (!/^-?(\d+\.?\d*|\.\d+)$/.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

export const isNumeric = (q: Question) => q.type === 'NUMERIC';

export const isAnswered = (q: Question, answers: Record<string, string[]>, numeric: Record<string, string>) =>
  isNumeric(q) ? toNumber(numeric[q.id]) !== null : (answers[q.id]?.length ?? 0) > 0;

/** Every numeric question is sent, so clearing a box clears the saved answer (null). */
export const valuesOf = (questions: Question[], numeric: Record<string, string>) =>
  Object.fromEntries(questions.filter(isNumeric).map((q) => [q.id, toNumber(numeric[q.id])]));
