'use client';

import { useEffect, useState } from 'react';

/** The story the hero plays on a loop: a calm exam, an AI query, the flag, then the human decision. */
export const STAGES = [
  { risk: 8, tab: false, alert: false, verdict: false },
  { risk: 14, tab: true, alert: false, verdict: false },
  { risk: 64, tab: true, alert: true, verdict: false },
  { risk: 64, tab: true, alert: true, verdict: true },
] as const;

export const OPTIONS = ['O(n)', 'O(n log n)', 'O(n²)', 'O(log n)'];

export const riskTone = (r: number) => (r >= 50 ? 'bg-danger' : r >= 25 ? 'bg-warning' : 'bg-success');

const START = 42 * 60 + 18;

/** Current story stage and the exam clock; the story never stops, it just runs slower when motion is reduced. */
export function useExamStory(reduce: boolean | null) {
  const [stage, setStage] = useState(0);
  const [left, setLeft] = useState(START);

  useEffect(() => {
    const story = setInterval(() => setStage((s) => (s + 1) % STAGES.length), reduce ? 5200 : 2600);
    const clock = setInterval(() => setLeft((t) => (t > 0 ? t - 1 : START)), 1000);
    return () => { clearInterval(story); clearInterval(clock); };
  }, [reduce]);

  return {
    s: STAGES[stage] ?? STAGES[0],
    clock: `${String(Math.floor(left / 60)).padStart(2, '0')}:${String(left % 60).padStart(2, '0')}`,
  };
}
