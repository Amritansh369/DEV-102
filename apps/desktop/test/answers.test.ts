import { describe, expect, it } from 'vitest'
import { isAnswered, toNumber, valuesOf } from '../src/lib/answers'
import type { Question } from '../src/lib/types'

const q = (id: string, type?: 'MCQ' | 'NUMERIC'): Question =>
  ({ id, examId: 'e1', text: 'Question', options: [], correctIds: [], multi: false, marks: 1, difficulty: 'EASY', tags: [], ...(type ? { type } : {}) })

describe('toNumber', () => {
  it('reads whole numbers, decimals and negatives', () => {
    expect([toNumber('42'), toNumber('3.14'), toNumber('-7.5'), toNumber('.5'), toNumber('3.'), toNumber('  12  ')]).toEqual([42, 3.14, -7.5, 0.5, 3, 12])
  })

  it('treats empty or half-typed input as no answer yet', () => {
    for (const raw of ['', '   ', '-', '.', '-.', undefined]) expect(toNumber(raw)).toBeNull()
  })

  it('rejects text, exponents, commas and extra symbols', () => {
    for (const raw of ['abc', '1e5', '1,000', '3.1.4', '--2', '+5', '12km']) expect(toNumber(raw)).toBeNull()
  })
})

describe('isAnswered', () => {
  it('uses the typed number for numeric questions and the options for the rest', () => {
    const answers = { m1: ['a'] }
    const numeric = { n1: '60', n2: '-' }
    expect(isAnswered(q('n1', 'NUMERIC'), answers, numeric)).toBe(true)
    expect(isAnswered(q('n2', 'NUMERIC'), answers, numeric)).toBe(false)
    expect(isAnswered(q('m1', 'MCQ'), answers, numeric)).toBe(true)
    expect(isAnswered(q('m2'), answers, numeric)).toBe(false)
  })
})

describe('valuesOf', () => {
  it('sends every numeric question, with null for an empty or invalid box', () => {
    const qs = [q('n1', 'NUMERIC'), q('n2', 'NUMERIC'), q('n3', 'NUMERIC'), q('m1', 'MCQ')]
    expect(valuesOf(qs, { n1: '72.5', n2: 'abc' })).toEqual({ n1: 72.5, n2: null, n3: null })
  })
})
