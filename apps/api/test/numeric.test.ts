import { describe, expect, it } from 'vitest';
import type { Question } from '@prisma/client';
import { gradeAnswer, scoreAnswers, toQuestion } from '../src/lib/domain.js';
import { buildReview, summarize } from '../src/lib/results.js';
import { validateQuestionRows } from '../src/modules/exams.js';

const numeric = (value: number, tolerance = 0, unit: string | null = null) =>
  ({ id: 'n1', marks: 2, correctIds: [], type: 'NUMERIC' as const, answerKey: { value, tolerance, unit } });
const mcq = { id: 'm1', marks: 1, correctIds: ['b'], type: 'MCQ' as const, answerKey: null };

describe('gradeAnswer for numeric questions', () => {
  it('accepts the exact value when there is no tolerance', () => {
    expect(gradeAnswer(numeric(42), [], 42)).toBe('CORRECT');
    expect(gradeAnswer(numeric(42), [], 42.001)).toBe('WRONG');
  });

  it('accepts anything within the tolerance, including the edges', () => {
    const q = numeric(3.14, 0.01);
    expect(gradeAnswer(q, [], 3.13)).toBe('CORRECT');
    expect(gradeAnswer(q, [], 3.15)).toBe('CORRECT'); // |3.15 - 3.14| is 0.010000000000000231 in binary floating point
    expect(gradeAnswer(q, [], 3.1501)).toBe('WRONG');
    expect(gradeAnswer(q, [], 3.1299)).toBe('WRONG');
  });

  it('handles negative and large values', () => {
    expect(gradeAnswer(numeric(-7.5, 0.5), [], -7.9)).toBe('CORRECT');
    expect(gradeAnswer(numeric(1_000_000, 100), [], 1_000_100)).toBe('CORRECT');
    expect(gradeAnswer(numeric(1_000_000, 100), [], 1_000_101)).toBe('WRONG');
  });

  it('treats a missing or non-finite value as unanswered', () => {
    for (const v of [undefined, null, Number.NaN, Number.POSITIVE_INFINITY]) expect(gradeAnswer(numeric(1), [], v)).toBe('UNANSWERED');
  });

  it('marks wrong rather than crashing when the answer key is missing', () => {
    expect(gradeAnswer({ ...numeric(1), answerKey: null }, [], 1)).toBe('WRONG');
  });

  it('still grades questions without a type as multiple choice', () => {
    expect(gradeAnswer({ id: 'x', marks: 1, correctIds: ['a'] }, ['a'])).toBe('CORRECT');
    expect(gradeAnswer(mcq, [], 99)).toBe('UNANSWERED');
  });
});

describe('scoreAnswers with mixed question types', () => {
  const qs = [mcq, numeric(10, 0.5), { ...numeric(5), id: 'n2' }];

  it('scores choice and numeric answers together', () => {
    const r = scoreAnswers(qs, new Map([['m1', ['b']]]), { enabled: false, value: 0 }, new Map([['n1', 10.4], ['n2', 6]]));
    expect(r).toEqual({ score: 3, correct: 2, wrong: 1, unanswered: 0 });
  });

  it('applies negative marking to wrong numeric answers', () => {
    const r = scoreAnswers(qs, new Map([['m1', ['b']]]), { enabled: true, value: 0.25 }, new Map([['n1', 10.4], ['n2', 6]]));
    expect(r.score).toBe(2.5);
  });

  it('counts an unanswered numeric question as unanswered', () => {
    expect(scoreAnswers(qs, new Map(), { enabled: true, value: 0.25 }).unanswered).toBe(3);
  });
});

describe('toQuestion', () => {
  const row = {
    id: 'n1', examId: 'e1', position: 0, text: 'Speed of the train in km/h?', options: [], correctIds: [], multi: false, marks: 2,
    difficulty: 'MEDIUM', tags: [], createdAt: new Date(), type: 'NUMERIC', answerKey: { value: 72, tolerance: 0.5, unit: 'km/h' },
  } as unknown as Question;

  it("keeps the answer key out of the candidate's paper but shows the unit", () => {
    const paper = toQuestion(row, false);
    expect(paper).toMatchObject({ type: 'NUMERIC', unit: 'km/h' });
    expect(JSON.stringify(paper)).not.toContain('72');
    expect(paper).not.toHaveProperty('answerKey');
    expect(paper).not.toHaveProperty('correctIds');
  });

  it('includes the answer key for staff', () => {
    expect(toQuestion(row)).toMatchObject({ answerKey: { value: 72, tolerance: 0.5, unit: 'km/h' } });
  });
});

describe('answer review for numeric questions', () => {
  const qs = [{ id: 'n1', text: 'Speed?', options: [], correctIds: [], marks: 2, type: 'NUMERIC' as const, answerKey: { value: 72, tolerance: 0.5, unit: 'km/h' } }];

  it('shows what was typed and what was accepted', () => {
    const [item] = buildReview(['n1'], qs, new Map(), { enabled: true, value: 0.25 }, new Map([['n1', 80]]));
    expect(item).toMatchObject({ status: 'WRONG', earned: -0.5, options: [], numeric: { given: 80, value: 72, tolerance: 0.5, unit: 'km/h' } });
  });

  it('shows an unanswered numeric question with no given value', () => {
    expect(buildReview(['n1'], qs, new Map(), { enabled: false, value: 0 })[0]!.numeric).toMatchObject({ given: null, value: 72 });
  });

  it('includes numeric marks in the summary', () => {
    expect(summarize(['n1'], qs, new Map(), { enabled: false, value: 0 }, new Map([['n1', 72.3]]))).toMatchObject({ score: 2, totalMarks: 2, correct: 1 });
  });
});

describe('CSV import of numeric questions', () => {
  const header = ['question', 'optionA', 'optionB', 'optionC', 'optionD', 'correct', 'marks', 'difficulty', 'tags', 'tolerance'];

  it('reads a row with no options and a number in "correct" as numeric, with an optional tolerance', () => {
    const r = validateQuestionRows([header, ['What is 12 squared, exactly?', '', '', '', '', '144', '2', 'EASY', 'math'], ['Value of pi to two decimals?', '', '', '', '', '3.14', '1', '', '', '0.005']], []);
    expect(r.errors).toEqual([]);
    expect(r.valid.map((d) => d.numeric)).toEqual([{ value: 144, tolerance: 0 }, { value: 3.14, tolerance: 0.005 }]);
    expect(r.valid[0]).toMatchObject({ options: [], correct: [], marks: 2, tags: ['math'] });
  });

  it('rejects a negative tolerance', () => {
    const r = validateQuestionRows([['What is 12 squared, exactly?', '', '', '', '', '144', '', '', '', '-1']], []);
    expect(r.errors[0]!.message).toBe('Tolerance must be a number of 0 or more.');
  });

  it('explains how to write a numeric row when there are no options and no number', () => {
    const r = validateQuestionRows([['What is 12 squared, exactly?', '', '', '', '', 'B']], []);
    expect(r.errors[0]!.message).toContain('put a number in "correct" for a numeric question');
  });

  it('imports multiple-choice rows exactly as before', () => {
    const r = validateQuestionRows([['Which planet is the red planet?', 'Mars', 'Venus', '', '', 'A', '1', 'EASY', 'space']], []);
    expect(r.valid[0]).toEqual({ text: 'Which planet is the red planet?', options: ['Mars', 'Venus'], correct: [0], marks: 1, difficulty: 'EASY', tags: ['space'] });
  });
});
