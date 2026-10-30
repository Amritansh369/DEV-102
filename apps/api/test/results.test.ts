import { describe, expect, it } from 'vitest';
import { buildReview, resultRelease, summarize, type ReleaseInput, type ReviewQuestion } from '../src/lib/results.js';

const ENDS = new Date('2026-10-28T12:00:00Z');
const BEFORE_END = new Date('2026-10-28T11:00:00Z');
const AFTER_END = new Date('2026-10-28T12:00:01Z');

const base: ReleaseInput = {
  release: 'AFTER_REVIEW', manualReleasedAt: null, examEndsAt: ENDS, sessionStatus: 'SUBMITTED',
  candidateStatus: 'SUBMITTED', decision: null, pendingFlags: 0, now: AFTER_END,
};
const release = (over: Partial<ReleaseInput>) => resultRelease({ ...base, ...over });

describe('resultRelease', () => {
  it('shows nothing before the candidate submits', () => {
    expect(release({ sessionStatus: 'LIVE' })).toMatchObject({ scoreReleased: false, reviewReleased: false, blockedBy: 'NOT_SUBMITTED' });
  });

  describe('IMMEDIATE', () => {
    it('releases the score on submit but holds the answer review until the window closes', () => {
      expect(release({ release: 'IMMEDIATE', now: BEFORE_END, pendingFlags: 3 })).toEqual({
        scoreReleased: true, reviewReleased: false, blockedBy: null, reviewOpensAt: ENDS.toISOString(),
      });
    });

    it('opens the answer review once the window has closed', () => {
      expect(release({ release: 'IMMEDIATE', now: AFTER_END })).toEqual({ scoreReleased: true, reviewReleased: true, blockedBy: null, reviewOpensAt: null });
    });
  });

  describe('AFTER_REVIEW', () => {
    it('holds everything while flagged events wait for a mentor', () => {
      expect(release({ pendingFlags: 2 })).toMatchObject({ scoreReleased: false, reviewReleased: false, blockedBy: 'PENDING_REVIEW' });
    });

    it('releases at once when nothing was flagged', () => {
      expect(release({ pendingFlags: 0 })).toMatchObject({ scoreReleased: true, reviewReleased: true });
    });

    it('releases when a mentor clears or warns the session, even with flags left unreviewed', () => {
      expect(release({ pendingFlags: 2, decision: 'CLEAR' }).scoreReleased).toBe(true);
      expect(release({ pendingFlags: 2, decision: 'WARN' }).scoreReleased).toBe(true);
    });

    it('still holds the answer review until the window closes', () => {
      expect(release({ now: BEFORE_END })).toMatchObject({ scoreReleased: true, reviewReleased: false, reviewOpensAt: ENDS.toISOString() });
    });
  });

  describe('MANUAL', () => {
    it('holds everything until an admin releases', () => {
      expect(release({ release: 'MANUAL' })).toMatchObject({ scoreReleased: false, blockedBy: 'PENDING_MANUAL' });
    });

    it('releases once an admin has released, ignoring unreviewed flags', () => {
      expect(release({ release: 'MANUAL', manualReleasedAt: ENDS.toISOString(), pendingFlags: 4 })).toMatchObject({ scoreReleased: true, reviewReleased: true });
    });

    it('holds the answer review when an admin releases before the window closes', () => {
      expect(release({ release: 'MANUAL', manualReleasedAt: BEFORE_END.toISOString(), now: BEFORE_END })).toMatchObject({ scoreReleased: true, reviewReleased: false });
    });
  });

  it('never releases a disqualified attempt, however it was disqualified', () => {
    for (const over of [{ sessionStatus: 'TERMINATED' as const }, { candidateStatus: 'DISQUALIFIED' as const }, { decision: 'DISQUALIFY' as const }]) {
      expect(release({ release: 'IMMEDIATE', ...over })).toMatchObject({ scoreReleased: false, reviewReleased: false, blockedBy: 'DISQUALIFIED' });
    }
  });

  it('holds the result when a retest is arranged', () => {
    expect(release({ release: 'IMMEDIATE', decision: 'RETEST' })).toMatchObject({ scoreReleased: false, blockedBy: 'RETEST' });
  });
});

const Q: ReviewQuestion[] = [
  { id: 'q1', text: 'Big-O of binary search?', options: [{ id: 'a', text: 'O(n)' }, { id: 'b', text: 'O(log n)' }], correctIds: ['b'], marks: 2 },
  { id: 'q2', text: 'Pick the primes', options: [{ id: 'a', text: '2' }, { id: 'b', text: '4' }, { id: 'c', text: '5' }], correctIds: ['a', 'c'], marks: 4 },
  { id: 'q3', text: 'HTTP status for Not Found?', options: [{ id: 'a', text: '404' }, { id: 'b', text: '500' }], correctIds: ['a'], marks: 1 },
];
const ORDER = ['q3', 'q1', 'q2'];
const ANSWERS = new Map([['q1', ['b']], ['q2', ['a']]]); // q1 right, q2 partly right (counts as wrong), q3 blank
const OFF = { enabled: false, value: 0 };
const QUARTER = { enabled: true, value: 0.25 };

describe('summarize', () => {
  it('takes deducted marks off the score and the percent', () => {
    expect(summarize(ORDER, Q, ANSWERS, OFF, new Map(), 1)).toMatchObject({ score: 1, penaltyMarks: 1, percent: 14.29 });
    expect(summarize(ORDER, Q, ANSWERS, OFF, new Map(), 9)).toMatchObject({ score: 0, percent: 0 });
  });

  it('scores in marks and percent with counts', () => {
    expect(summarize(ORDER, Q, ANSWERS, OFF)).toEqual({ penaltyMarks: 0, score: 2, totalMarks: 7, percent: 28.57, correct: 1, wrong: 1, unanswered: 1, negativeMarking: OFF });
  });

  it('applies negative marking to wrong answers', () => {
    expect(summarize(ORDER, Q, ANSWERS, QUARTER)).toMatchObject({ score: 1, percent: 14.29 });
  });

  it('only counts questions this candidate was given', () => {
    expect(summarize(['q1'], Q, ANSWERS, OFF)).toMatchObject({ score: 2, totalMarks: 2, percent: 100 });
  });
});

describe('buildReview', () => {
  it('lists questions in the order the candidate saw them, with their answers and the correct ones', () => {
    const review = buildReview(ORDER, Q, ANSWERS, OFF);
    expect(review.map((r) => [r.position, r.questionId, r.status, r.earned])).toEqual([[1, 'q3', 'UNANSWERED', 0], [2, 'q1', 'CORRECT', 2], [3, 'q2', 'WRONG', 0]]);
    expect(review[2]!.options).toEqual([
      { id: 'a', text: '2', picked: true, correct: true },
      { id: 'b', text: '4', picked: false, correct: false },
      { id: 'c', text: '5', picked: false, correct: true },
    ]);
  });

  it('shows the marks lost on a wrong answer under negative marking', () => {
    expect(buildReview(ORDER, Q, ANSWERS, QUARTER).find((r) => r.questionId === 'q2')!.earned).toBe(-1);
  });

  it('skips questions deleted after the exam', () => {
    expect(buildReview(['q1', 'gone'], Q, ANSWERS, OFF).map((r) => r.questionId)).toEqual(['q1']);
  });
});
